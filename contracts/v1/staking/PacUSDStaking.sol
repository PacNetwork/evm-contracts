// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {IPacUSDStaking} from "./interfaces/IPacUSDStaking.sol";
import {IRewardScheme} from "./interfaces/IRewardScheme.sol";
import {IPricer} from "../../interfaces/IPricer.sol";
import {BaseStaking} from "./BaseStaking.sol";
import {IMMFVault} from "../vault/interfaces/IMMFVault.sol";

contract PacUSDStaking is BaseStaking, IPacUSDStaking {
    using SafeERC20 for IERC20;

    // errors
    error ZeroAmount();
    error InvalidArrayLength();
    error InvalidPrice(uint256 attested, uint256 ref); // attested price must not be larger than the reference price
    error InvalidRewardRate(uint256 attested, uint256 ref); // attested reward rate must not be larger than the reference reward rate
    error InvalidTokenSupply(uint256 totalSupply, uint256 totalStaked);
    error InsufficientStakingBalance(
        address user,
        uint256 amount,
        uint256 balance
    );
    error InsufficientTokenBalance(
        address user,
        uint256 amount,
        uint256 balance
    );
    error InsufficientRewardBalance(
        address user,
        uint256 amount,
        uint256 balance
    );
    error InsufficientStakingPeriod(
        address user,
        uint256 unstakeAt,
        uint256 unlockedAt
    );
    error RewardSchemeAlreadyAdded(address scheme);
    error RewardSchemeNotFound(address scheme);
    error NotUpdater();

    bytes32 public constant RESERVE_SET_ROLE = keccak256("RESERVE_SET_ROLE");
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant REWARD_SCHEME_ROLE =
        keccak256("REWARD_SCHEME_ROLE");

    IERC20 public STAKED_TOKEN;
    uint256 public PRECISION;
    uint256 public RATE_PRECISION;
    address public RESERVE;
    mapping(address => address) public PRICERS;
    mapping(address => address) public MMFTOKENS;

    /// @notice minimum staking period in seconds
    /// @dev can be set by admin, default is 1 day
    uint256 public minStakingPeriod;

    /// @notice mapping from reward scheme address to its index
    /// @dev scheme index starts from 1
    mapping(address => uint256) public schemeIndexMap;
    address[] public rewardSchemes;

    uint256 internal totalStaked_;
    uint256 internal accumulatedRewardRate;
    mapping(address => uint256) internal lastPrices;
    mapping(address => uint256) internal stakingBalances;
    mapping(address => bool) internal _updaters;
    /// @dev RESET whenever a user stakes/unstakes tokens
    mapping(address => uint256) internal stakingTimestamps;

    mapping(address => uint256) internal rewardBalances;
    mapping(address => uint256) internal allowedUnstakedAmounts;
    mapping(address => uint256) internal entryRewardRates;

    event Staked(address indexed user, uint256 amount);
    event Unstaked(address indexed user, uint256 amount);
    event Restaked(address indexed user, uint256 amount);
    event RewardClaimed(address indexed user, uint256 amount);
    event Updated(address indexed updater, uint256 price, uint256 rewardRate);
    event ReserveSet(address indexed reserve);
    event RewardSchemeAdded(address indexed scheme);
    event RewardSchemeRemoved(address indexed scheme);
    event MinStakingPeriodSet(uint256 indexed period);

    /**
     * @notice Initializes the staking contract.
     * @param token staked token address
     * @param upgrader address that can upgrade the contract
     * @param admin admin address
     * @param vaults vault addresses
     * @param pricers pricer addresses of the underlying assets
     * @param mmfTokens  addresses of the underlying assets
     */
    function initialize(
        address token,
        address upgrader,
        address admin,
        address reserve,
        address[] memory vaults,
        address[] memory pricers,
        address[] memory mmfTokens
    ) public virtual initializer {
        if (
            vaults.length == 0 ||
            vaults.length != pricers.length ||
            vaults.length != mmfTokens.length
        ) revert InvalidArrayLength();

        if (token == address(0) || reserve == address(0)) revert ZeroAddress();

        uint256 len = vaults.length;
        for (uint256 i; i < len; ++i) {
            if (vaults[i] == address(0)) revert ZeroAddress();
            if (pricers[i] == address(0)) revert ZeroAddress();
            if (mmfTokens[i] == address(0)) revert ZeroAddress();
        }

        __BaseStaking_init(upgrader, admin);

        STAKED_TOKEN = IERC20(token);
        PRECISION = 10 ** ERC20(token).decimals();
        RATE_PRECISION = 10 ** (ERC20(token).decimals() * 2);
        RESERVE = reserve;
        for (uint256 i; i < len; ++i) {
            PRICERS[vaults[i]] = pricers[i];
            MMFTOKENS[vaults[i]] = mmfTokens[i];
        }

        minStakingPeriod = 1 days;

        _grantRole(DEFAULT_ADMIN_ROLE, admin);
        for (uint256 i; i < len; ++i) {
            _updaters[vaults[i]] = true;
            // initialize price
            IPricer price = IPricer(pricers[i]);
            uint256 latestPrice = price.getLatestPrice();
            if (latestPrice < PRECISION)
                revert InvalidPrice(latestPrice, PRECISION);
            lastPrices[vaults[i]] = latestPrice;
        }
    }

    /**
     * @dev Modifier that only updater can call
     */
    modifier onlyUpdater() {
        if (!_updaters[_msgSender()]) revert NotUpdater();
        _;
    }

    function pause() external onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() external onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function addRewardScheme(
        address scheme
    ) external onlyRole(REWARD_SCHEME_ROLE) {
        if (scheme == address(0)) revert ZeroAddress();

        // check if the scheme is already added
        if (schemeIndexMap[scheme] != 0)
            revert RewardSchemeAlreadyAdded(scheme);

        // add the scheme
        rewardSchemes.push(scheme);
        uint256 index = rewardSchemes.length;
        schemeIndexMap[scheme] = index;

        emit RewardSchemeAdded(scheme);
    }

    function removeRewardScheme(
        address scheme
    ) external onlyRole(REWARD_SCHEME_ROLE) {
        if (scheme == address(0)) revert ZeroAddress();

        // check if the scheme is added
        uint256 index = schemeIndexMap[scheme];
        if (index == 0) revert RewardSchemeNotFound(scheme);

        // remove the scheme
        uint256 length = rewardSchemes.length;
        if (index != length) {
            // assign the last element to the to-be-removed element's position
            address lastScheme = rewardSchemes[length-1];
            rewardSchemes[index - 1] = lastScheme;
            schemeIndexMap[lastScheme] = index;
        }
        rewardSchemes.pop();
        delete schemeIndexMap[scheme];

        emit RewardSchemeRemoved(scheme);
    }

    function setReserve(address reserve) external onlyRole(RESERVE_SET_ROLE) {
        if (reserve == address(0)) revert ZeroAddress();

        uint256 accumulated = rewardBalances[RESERVE];
        rewardBalances[RESERVE] = 0;

        RESERVE = reserve;
        rewardBalances[RESERVE] = accumulated;

        emit ReserveSet(reserve);
    }

    function setMinStakingPeriod(
        uint256 period
    ) external onlyRole(DEFAULT_ADMIN_ROLE) {
        minStakingPeriod = period;

        emit MinStakingPeriodSet(period);
    }

    /**
     * @notice stake tokens.
     * @param amount the amount of tokens to stake.
     */
    function stake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        address user = _msgSender();

        uint256 bal = STAKED_TOKEN.balanceOf(user);
        if (amount > bal) revert InsufficientTokenBalance(user, amount, bal);

        // transfer the staked tokens to the contract
        STAKED_TOKEN.safeTransferFrom(user, address(this), amount);

        // update total staked amount
        totalStaked_ += amount;

        uint256 updatedStakingBalance = stakingBalances[user] + amount;
        _updateUserInternalState(user, updatedStakingBalance);

        // Set the user's staking timestamp
        stakingTimestamps[user] = block.timestamp;

        // update the external reward schemes
        uint256 length = rewardSchemes.length;
        for (uint256 i; i < length; ++i) {
            IRewardScheme scheme = IRewardScheme(rewardSchemes[i]);
            if (scheme.isActive()) {
                scheme.updateUserInternalState(user, updatedStakingBalance);
            }
        }

        emit Staked(user, amount);
    }

    /**
     * @notice unstake tokens.
     * @param amount the amount of tokens to unstake.
     */
    function unstake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        address user = _msgSender();

        uint256 bal = stakingBalances[user];

        // check staking balance
        if (bal < amount) revert InsufficientStakingBalance(user, amount, bal);

        // check staking period
        uint256 start = stakingTimestamps[user];
        if (block.timestamp < start + minStakingPeriod) {
            revert InsufficientStakingPeriod(
                user,
                block.timestamp,
                start + minStakingPeriod
            );
        }

        // update the user's state and unclaimed rewards
        uint256 updatedStakingBalance = bal - amount;
        _updateUserInternalState(user, updatedStakingBalance);

        // update the external reward schemes
        uint256 length = rewardSchemes.length;
        for (uint256 i; i < length; ++i) {
            IRewardScheme scheme = IRewardScheme(rewardSchemes[i]);
            if (scheme.isActive())
                scheme.updateUserInternalState(user, updatedStakingBalance);
        }

        // update total staked amount
        totalStaked_ -= amount;

        // transfer the unstaked tokens to the user
        STAKED_TOKEN.safeTransfer(user, amount);

        // update staking timestamp
        if (updatedStakingBalance == 0) {
            // reset the staking timestamp if the user has no staked tokens
            delete stakingTimestamps[user];
        } else {
            // update the staking timestamp to the current time
            stakingTimestamps[user] = block.timestamp;
        }

        emit Unstaked(user, amount);
    }

    /**
     * @notice restake unclaimed rewards.
     * @param amount the amount of tokens to stake.
     */
    function restake(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        address user = _msgSender();

        // get the user's unclaimed reward
        uint256 reward = rewardBalances[user] + _calculateRewardIncrement(user);

        if (reward < amount)
            revert InsufficientRewardBalance(user, amount, reward);

        // update the total staked amount
        totalStaked_ += amount;

        uint256 updatedStakingBalance = stakingBalances[user] + amount;
        _updateUserInternalState(user, updatedStakingBalance);

        // update the external reward schemes
        uint256 length = rewardSchemes.length;
        for (uint256 i; i < length; ++i) {
            IRewardScheme scheme = IRewardScheme(rewardSchemes[i]);
            if (scheme.isActive())
                scheme.updateUserInternalState(user, updatedStakingBalance);
        }

        // deduction needs to be performed after the reward balance is updated
        rewardBalances[user] -= amount;

        emit Restaked(user, amount);
    }

    /**
     * @notice claim reward.
     * @param amount the amount of reward to claim.
     */
    function claimReward(uint256 amount) external nonReentrant whenNotPaused {
        if (amount == 0) revert ZeroAmount();

        address user = _msgSender();

        // Call _updateUserInternalState to update the user's reward balance
        _updateUserInternalState(user, stakingBalances[user]);

        uint256 bal = rewardBalances[user];
        if (bal < amount) revert InsufficientRewardBalance(user, amount, bal);

        rewardBalances[user] -= amount;

        STAKED_TOKEN.safeTransfer(user, amount);

        emit RewardClaimed(user, amount);
    }

    /**
     * @notice update the accumulated rewward rate based on the latest price.
     * @dev the price assumed to be monotonically increasing.
     */
    function update() external onlyUpdater nonReentrant whenNotPaused {
        address updater = _msgSender();

        IPricer pricer = IPricer(PRICERS[updater]);
        uint256 lastPrice = lastPrices[updater];
        uint256 currentPrice = pricer.getLatestPrice();

        if (currentPrice < lastPrice)
            revert InvalidPrice(currentPrice, lastPrice);

        // nothing to update if the price is the same
        if (currentPrice == lastPrice) return;

        //Get updater mmftoken balance
        uint256 updaterBalance = IMMFVault(updater).totalMMFToken();

        if (updaterBalance > 0) {
            uint256 totalSupply = STAKED_TOKEN.totalSupply();
            if (totalSupply < totalStaked_)
                revert InvalidTokenSupply(totalSupply, totalStaked_);
            //calculate the current increase of this vault
            uint256 r = (updaterBalance *
                (currentPrice - lastPrice) *
                PRECISION) / totalSupply; //  PRECISION= 10**(ERC20(token).decimals()*2 -  ERC20(token).decimals()) 

            accumulatedRewardRate += r;

            // update reward balance for RESERVE
            uint256 reward = ((totalSupply - totalStaked_) * r) /
                RATE_PRECISION;
            rewardBalances[RESERVE] += reward;
        }

        // update last price
        lastPrices[updater] = currentPrice;

        // update the external reward schemes
        uint256 length = rewardSchemes.length;
        for (uint256 i; i < length; ++i) {
            IRewardScheme scheme = IRewardScheme(rewardSchemes[i]);
            if (scheme.isActive()) scheme.update();
        }

        emit Updated(updater, currentPrice, accumulatedRewardRate);

        return;
    }

    /**
     * @notice update the entry reward rate, timestamp and staking and reward balance for a user.
     * @dev this function is called when the user stakes, unstakes, or restakes tokens.
     * @param user the user's address.
     * @param stakedAmount the updated amount of staked tokens.
     */
    function _updateUserInternalState(
        address user,
        uint256 stakedAmount
    ) internal virtual {
        uint256 reward = _calculateRewardIncrement(user);
        if (reward > 0) {
            // update the user's reward balance
            rewardBalances[user] += reward;
        }

        if (stakedAmount == 0) {
            delete stakingBalances[user];
            delete entryRewardRates[user];
        } else {
            stakingBalances[user] = stakedAmount;
            entryRewardRates[user] = accumulatedRewardRate;
        }
    }

    /**
     * @notice calculate the reward increment since last update of entryRewardRate.
     * @param user user address
     * @return uint256
     */
    function _calculateRewardIncrement(
        address user
    ) internal view virtual returns (uint256) {
        // get the staking balance
        uint256 bal = stakingBalances[user];

        // no staked tokens, no unclaimed reward
        if (bal == 0) return 0;

        // get the entry reward rate
        uint256 entryRewardRate = entryRewardRates[user];

        // current accumulated reward rate must not be less than the entry reward rate
        if (entryRewardRate > accumulatedRewardRate)
            revert InvalidRewardRate(entryRewardRate, accumulatedRewardRate);

        // no reward rate increase, no unclaimed reward
        if (entryRewardRate == accumulatedRewardRate) return 0;

        // calculate the total unclaimed reward
        uint256 reward = (bal * (accumulatedRewardRate - entryRewardRate)) /
            RATE_PRECISION;

        return reward;
    }

    /**
     * @notice implementation version.
     */
    function version() external pure virtual returns (string memory) {
        return "v1";
    }

    /**
     * @notice get the unclaimed reward.
     * @return uint256.
     */
    function rewardOf(address user) external view returns (uint256) {
        return rewardBalances[user] + _calculateRewardIncrement(user);
    }

    /**
     * @notice get the current staked amount.
     * @param user the user's address.
     * @return uint256.
     */
    function balanceOf(address user) external view returns (uint256) {
        return stakingBalances[user];
    }

    /**
     * @notice get the total staked amount.
     * @return uint256.
     */
    function totalStaked() external view returns (uint256) {
        return totalStaked_;
    }

    function getAllSchemes() external view returns (address[] memory) {
        return rewardSchemes;
    }

     /**
     * @notice Checks if an account has updater privileges.
     * @dev View function to query the updater status of an account.
     * @param account The address to check.
     * @return bool True if the account is a updater, false otherwise.
     */
    function isUpdater(address account) public view returns (bool) {
        return _updaters[account];
    }

}
