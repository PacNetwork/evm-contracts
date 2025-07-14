import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import {
  PacUSD,
  PacUSD__factory,
  MockERC20,
  MockERC20__factory,
} from "../../../typechain-types";

describe("PacUSD", function () {
  let pacUSD: PacUSD;
  let owner: SignerWithAddress;
  let upgrader: SignerWithAddress;
  let pauser: SignerWithAddress;
  let blacklister: SignerWithAddress;
  let approver: SignerWithAddress;
  let rescuer: SignerWithAddress;
  let minter: SignerWithAddress;
  let minter2: SignerWithAddress;
  let user1: SignerWithAddress;
  let user2: SignerWithAddress;

  const NAME = "PAC USD Stablecoin";
  const SYMBOL = "PacUSD";
  const ZERO_ADDRESS = ethers.ZeroAddress;
  const TX_ID = ethers.encodeBytes32String("test-tx");
  const TX_ID_2 = ethers.encodeBytes32String("test-tx-2");
  const AMOUNT = ethers.parseUnits("100", 18);
  const ZERO_AMOUNT = 0n;
  const MAX_UINT256 = ethers.MaxUint256;

  beforeEach(async function () {
    [
      owner,
      upgrader,
      pauser,
      blacklister,
      approver,
      rescuer,
      minter,
      minter2,
      user1,
      user2,
    ] = await ethers.getSigners();

    const PacUSD = (await ethers.getContractFactory(
      "PacUSD"
    )) as PacUSD__factory;
    pacUSD = (await upgrades.deployProxy(
      PacUSD,
      [owner.address, upgrader.address, [minter.address, minter2.address]],
      {
        initializer: "initialize",
        kind: "uups",
      }
    )) as unknown as PacUSD;
    await pacUSD.waitForDeployment();

    await pacUSD.grantRole(await pacUSD.PAUSER_ROLE(), owner.address);
    await pacUSD.grantRole(await pacUSD.BLOCKLISTER_ROLE(), owner.address);
    await pacUSD.grantRole(await pacUSD.APPROVER_ROLE(), owner.address);
    await pacUSD.grantRole(await pacUSD.RESCUER_ROLE(), owner.address);
  });

  describe("Initialization", function () {
    it("should initialize with correct parameters", async function () {
      expect(await pacUSD.name()).to.equal(NAME);
      expect(await pacUSD.symbol()).to.equal(SYMBOL);
      expect(await pacUSD.isMinter(minter.address)).to.be.true;
      expect(await pacUSD.isMinter(minter2.address)).to.be.true;
      expect(await pacUSD.isMinter(user1.address)).to.be.false;
      expect(await pacUSD.version()).to.equal("v1");
      expect(
        await pacUSD.hasRole(await pacUSD.DEFAULT_ADMIN_ROLE(), owner.address)
      ).to.be.true;
      expect(await pacUSD.hasRole(await pacUSD.PAUSER_ROLE(), owner.address)).to
        .be.true;
      expect(
        await pacUSD.hasRole(await pacUSD.BLOCKLISTER_ROLE(), owner.address)
      ).to.be.true;
      expect(await pacUSD.hasRole(await pacUSD.APPROVER_ROLE(), owner.address))
        .to.be.true;
      expect(await pacUSD.hasRole(await pacUSD.RESCUER_ROLE(), owner.address))
        .to.be.true;
    });

    it("should revert if initialized with zero addresses", async function () {
      const PacUSDFactory = (await ethers.getContractFactory(
        "PacUSD"
      )) as PacUSD__factory;

      await expect(
        upgrades.deployProxy(
          PacUSDFactory,
          [ZERO_ADDRESS, upgrader.address, [minter.address]],
          {
            initializer: "initialize",
            kind: "uups",
          }
        )
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
      await expect(
        upgrades.deployProxy(
          PacUSDFactory,
          [owner.address, ZERO_ADDRESS, [minter.address]],
          {
            initializer: "initialize",
            kind: "uups",
          }
        )
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
      await expect(
        upgrades.deployProxy(
          PacUSDFactory,
          [owner.address, upgrader.address, []],
          {
            initializer: "initialize",
            kind: "uups",
          }
        )
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
    });

    it("should skip zero address minters during initialization", async function () {
      const PacUSD = (await ethers.getContractFactory(
        "PacUSD"
      )) as PacUSD__factory;
      const newPacUSD = (await upgrades.deployProxy(
        PacUSD,
        [owner.address, upgrader.address, [minter.address, ZERO_ADDRESS]],
        {
          initializer: "initialize",
          kind: "uups",
        }
      )) as unknown as PacUSD;
      expect(await newPacUSD.isMinter(minter.address)).to.be.true;
      expect(await newPacUSD.isMinter(ZERO_ADDRESS)).to.be.false;
    });
  });

  describe("Role Management", function () {
    it("should allow owner to grant roles", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.PAUSER_ROLE(), user1.address);
      expect(await pacUSD.hasRole(await pacUSD.PAUSER_ROLE(), user1.address)).to
        .be.true;
    });

    it("should allow owner to grant multiple roles", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.PAUSER_ROLE(), user1.address);
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.BLOCKLISTER_ROLE(), user1.address);
      expect(await pacUSD.hasRole(await pacUSD.PAUSER_ROLE(), user1.address)).to
        .be.true;
      expect(
        await pacUSD.hasRole(await pacUSD.BLOCKLISTER_ROLE(), user1.address)
      ).to.be.true;
    });

    it("should revert if granting role to zero address", async function () {
      await expect(
        pacUSD
          .connect(owner)
          .grantRole(await pacUSD.PAUSER_ROLE(), ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
    });

    it("should revert if non-role-admin tries to grant role", async function () {
      await expect(
        pacUSD
          .connect(user1)
          .grantRole(await pacUSD.PAUSER_ROLE(), user2.address)
      ).to.be.revertedWithCustomError(
        pacUSD,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("should allow owner to revoke roles", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.PAUSER_ROLE(), user1.address);
      await pacUSD
        .connect(owner)
        .revokeRole(await pacUSD.PAUSER_ROLE(), user1.address);
      expect(await pacUSD.hasRole(await pacUSD.PAUSER_ROLE(), user1.address)).to
        .be.false;
    });

    it("should revert if revoking role from zero address", async function () {
      await expect(
        pacUSD
          .connect(owner)
          .revokeRole(await pacUSD.PAUSER_ROLE(), ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
    });

    it("should revert if non-role-admin tries to revoke role", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.PAUSER_ROLE(), user1.address);
      await expect(
        pacUSD
          .connect(user2)
          .revokeRole(await pacUSD.PAUSER_ROLE(), user1.address)
      ).to.be.revertedWithCustomError(
        pacUSD,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("Pausing", function () {
    it("should allow pauser to pause contract", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.PAUSER_ROLE(), pauser.address);
      await expect(pacUSD.connect(pauser).pause())
        .to.emit(pacUSD, "Paused")
        .withArgs(pauser.address);
      expect(await pacUSD.paused()).to.be.true;
    });

    it("should revert if non-pauser tries to pause", async function () {
      await expect(pacUSD.connect(user1).pause()).to.be.revertedWithCustomError(
        pacUSD,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("should allow pauser to unpause contract", async function () {
      await pacUSD.connect(owner).pause();
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.PAUSER_ROLE(), pauser.address);
      await expect(pacUSD.connect(pauser).unpause())
        .to.emit(pacUSD, "Unpaused")
        .withArgs(pauser.address);
      expect(await pacUSD.paused()).to.be.false;
    });

    it("should revert if non-pauser tries to unpause", async function () {
      await pacUSD.connect(owner).pause();
      await expect(
        pacUSD.connect(user1).unpause()
      ).to.be.revertedWithCustomError(
        pacUSD,
        "AccessControlUnauthorizedAccount"
      );
    });
  });

  describe("Blacklisting", function () {
    it("should allow blacklister to blocklist an account", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.BLOCKLISTER_ROLE(), blacklister.address);
      await expect(pacUSD.connect(blacklister).addToBlocklist(user1.address))
        .to.emit(pacUSD, "AddToBlocklist")
        .withArgs(user1.address);
      expect(await pacUSD.isBlocklisted(user1.address)).to.be.true;
    });

    it("should revert if blacklisting zero address", async function () {
      await expect(
        pacUSD.connect(owner).addToBlocklist(ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
    });

    it("should revert if non-blacklister tries to addToBlocklist", async function () {
      await expect(
        pacUSD.connect(user1).addToBlocklist(user2.address)
      ).to.be.revertedWithCustomError(
        pacUSD,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("should allow blacklister to removeFromBlacklist an account", async function () {
      await pacUSD.connect(owner).addToBlocklist(user1.address);
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.BLOCKLISTER_ROLE(), blacklister.address);
      await expect(
        pacUSD.connect(blacklister).removeFromBlocklist(user1.address)
      )
        .to.emit(pacUSD, "RemoveFromBlocklist")
        .withArgs(user1.address);
      expect(await pacUSD.isBlocklisted(user1.address)).to.be.false;
    });

    it("should revert if unblacklisting zero address", async function () {
      await expect(
        pacUSD.connect(owner).removeFromBlocklist(ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
    });
  });

  describe("Minting", function () {
    it("should allow approver to set mint transaction", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.APPROVER_ROLE(), approver.address);
      await expect(pacUSD.connect(approver).setMintByTx(TX_ID))
        .to.emit(pacUSD, "MintTxSet")
        .withArgs(TX_ID);
    });

    it("should revert if non-approver tries to set mint transaction", async function () {
      await expect(
        pacUSD.connect(user1).setMintByTx(TX_ID)
      ).to.be.revertedWithCustomError(
        pacUSD,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("should revert if mint transaction already exists", async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await expect(
        pacUSD.connect(owner).setMintByTx(TX_ID)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should allow minter to execute mint transaction", async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await expect(
        pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address)
      )
        .to.emit(pacUSD, "Mint")
        .withArgs(user1.address, AMOUNT);
      expect(await pacUSD.balanceOf(user1.address)).to.equal(AMOUNT);
      expect(await pacUSD.totalSupply()).to.equal(AMOUNT);
    });

    it("should revert if non-minter tries to execute mint", async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await expect(
        pacUSD.connect(user1).mintByTx(TX_ID, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "NotMinter");
    });

    it("should revert if mint transaction doesn't exist", async function () {
      await expect(
        pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should revert if mint transaction already executed", async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address);
      await expect(
        pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should revert if minting to zero address", async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await expect(
        pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
    });

    it("should revert if minting to blacklisted address", async function () {
      await pacUSD.connect(owner).addToBlocklist(user1.address);
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await expect(
        pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should allow minting zero amount", async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await expect(
        pacUSD.connect(minter).mintByTx(TX_ID, ZERO_AMOUNT, user1.address)
      )
        .to.emit(pacUSD, "Mint")
        .withArgs(user1.address, ZERO_AMOUNT);
      expect(await pacUSD.balanceOf(user1.address)).to.equal(0);
    });

    it("should revert minting when paused", async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await pacUSD.connect(owner).pause();
      await expect(
        pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "EnforcedPause");
    });

    it("should allow approver to cancel mint transaction", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.APPROVER_ROLE(), approver.address);
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await expect(pacUSD.connect(approver).cancelMintByTx(TX_ID))
        .to.emit(pacUSD, "MintTxCancelled")
        .withArgs(TX_ID);
      await expect(
        pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should revert if cancelling non-existent mint transaction", async function () {
      await expect(
        pacUSD.connect(owner).cancelMintByTx(TX_ID)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should revert if cancelling executed mint transaction", async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address);
      await expect(
        pacUSD.connect(owner).cancelMintByTx(TX_ID)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should allow approver to mint rewards", async function () {
      await expect(pacUSD.connect(minter).mintReward(AMOUNT, user1.address))
        .to.emit(pacUSD, "MintReward")
        .withArgs(user1.address, AMOUNT);
      expect(await pacUSD.balanceOf(user1.address)).to.equal(AMOUNT);
    });

    it("should revert if non-approver tries to mint rewards", async function () {
      await expect(
        pacUSD.connect(user1).mintReward(AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "NotMinter");
    });

    it("should revert if minting reward to zero address", async function () {
      await expect(
        pacUSD.connect(minter).mintReward(AMOUNT, ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
    });

    it("should revert if minting reward to blacklisted address", async function () {
      await pacUSD.connect(owner).addToBlocklist(user1.address);
      await expect(
        pacUSD.connect(minter).mintReward(AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert minting reward when paused", async function () {
      await pacUSD.connect(owner).pause();
      await expect(
        pacUSD.connect(minter).mintReward(AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "EnforcedPause");
    });
  });

  describe("Burning", function () {
    beforeEach(async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address);
    });

    it("should allow approver to set burn transaction", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.APPROVER_ROLE(), approver.address);
      await expect(pacUSD.connect(approver).setBurnByTx(TX_ID_2))
        .to.emit(pacUSD, "BurnTxSet")
        .withArgs(TX_ID_2);
    });

    it("should revert if burn transaction already exists", async function () {
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await expect(
        pacUSD.connect(owner).setBurnByTx(TX_ID_2)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should allow minter to execute burn transaction", async function () {
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await expect(
        pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT, user1.address)
      )
        .to.emit(pacUSD, "Burn")
        .withArgs(user1.address, AMOUNT);
      expect(await pacUSD.balanceOf(user1.address)).to.equal(0);
      expect(await pacUSD.totalSupply()).to.equal(0);
    });

    it("should revert if non-minter tries to execute burn", async function () {
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await expect(
        pacUSD.connect(user1).burnByTx(TX_ID_2, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "NotMinter");
    });

    it("should revert if burn transaction doesn't exist", async function () {
      await expect(
        pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should revert if burn transaction already executed", async function () {
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT, user1.address);
      await expect(
        pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should revert if burning from zero address", async function () {
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await expect(
        pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT, ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
    });

    it("should revert if burning from blacklisted address", async function () {
      await pacUSD.connect(owner).addToBlocklist(user1.address);
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await expect(
        pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert if insufficient balance for burn", async function () {
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await expect(
        pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT + 1n, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "InsufficientBalance");
    });

    it("should allow burning zero amount", async function () {
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await expect(
        pacUSD.connect(minter).burnByTx(TX_ID_2, ZERO_AMOUNT, user1.address)
      )
        .to.emit(pacUSD, "Burn")
        .withArgs(user1.address, ZERO_AMOUNT);
      expect(await pacUSD.balanceOf(user1.address)).to.equal(AMOUNT);
    });

    it("should revert burning when paused", async function () {
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await pacUSD.connect(owner).pause();
      await expect(
        pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "EnforcedPause");
    });

    it("should allow approver to cancel burn transaction", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.APPROVER_ROLE(), approver.address);
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await expect(pacUSD.connect(approver).cancelBurnByTx(TX_ID_2))
        .to.emit(pacUSD, "BurnTxCancelled")
        .withArgs(TX_ID_2);
      await expect(
        pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should revert if canceling non-existent burn transaction", async function () {
      await expect(
        pacUSD.connect(owner).cancelBurnByTx(TX_ID_2)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });

    it("should revert if canceling executed burn transaction", async function () {
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT, user1.address);
      await expect(
        pacUSD.connect(owner).cancelBurnByTx(TX_ID_2)
      ).to.be.revertedWithCustomError(pacUSD, "TxIdInvalid");
    });
  });

  describe("Transfers", function () {
    beforeEach(async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address);
    });

    it("should allow normal transfers", async function () {
      await expect(pacUSD.connect(user1).transfer(user2.address, AMOUNT))
        .to.emit(pacUSD, "Transfer")
        .withArgs(user1.address, user2.address, AMOUNT);
      expect(await pacUSD.balanceOf(user1.address)).to.equal(0);
      expect(await pacUSD.balanceOf(user2.address)).to.equal(AMOUNT);
    });

    it("should allow transferFrom with allowance", async function () {
      await pacUSD.connect(user1).approve(user2.address, AMOUNT);
      await expect(
        pacUSD.connect(user2).transferFrom(user1.address, user2.address, AMOUNT)
      ).to.emit(pacUSD, "Transfer");
      expect(await pacUSD.balanceOf(user1.address)).to.equal(0);
      expect(await pacUSD.balanceOf(user2.address)).to.equal(AMOUNT);
      expect(await pacUSD.allowance(user1.address, user2.address)).to.equal(0);
    });

    it("should revert if transferFrom balance more than allowance", async function () {
      await pacUSD.connect(user1).approve(user2.address, AMOUNT / BigInt(2));
      await expect(
        pacUSD.connect(user2).transferFrom(user1.address, user2.address, AMOUNT)
      )
        .to.be.revertedWithCustomError(pacUSD, "ERC20InsufficientAllowance")
        .withArgs(user2.address, AMOUNT / BigInt(2), AMOUNT);
    });

    it("should revert if transfer from blacklisted sender", async function () {
      await pacUSD.connect(owner).addToBlocklist(user1.address);
      await expect(
        pacUSD.connect(user1).transfer(user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert if transfer to blacklisted recipient", async function () {
      await pacUSD.connect(owner).addToBlocklist(user2.address);
      await expect(
        pacUSD.connect(user1).transfer(user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert if transfer when paused", async function () {
      await pacUSD.connect(owner).pause();
      await expect(
        pacUSD.connect(user1).transfer(user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "EnforcedPause");
    });

    it("should allow transfer of zero amount", async function () {
      await expect(pacUSD.connect(user1).transfer(user2.address, ZERO_AMOUNT))
        .to.emit(pacUSD, "Transfer")
        .withArgs(user1.address, user2.address, 0);
      expect(await pacUSD.balanceOf(user1.address)).to.equal(AMOUNT);
      expect(await pacUSD.balanceOf(user2.address)).to.equal(0);
    });

    it("should revert if transfer exceeds balance", async function () {
      await expect(
        pacUSD.connect(user1).transfer(user2.address, AMOUNT + 1n)
      ).to.be.revertedWithCustomError(pacUSD, "ERC20InsufficientBalance");
    });

    it("should allow self-transfer", async function () {
      await expect(pacUSD.connect(user1).transfer(user1.address, AMOUNT))
        .to.emit(pacUSD, "Transfer")
        .withArgs(user1.address, user1.address, AMOUNT);
      expect(await pacUSD.balanceOf(user1.address)).to.equal(AMOUNT);
    });

    it("should revert transferFrom from blacklisted sender", async function () {
      await pacUSD.connect(user1).approve(user2.address, AMOUNT);
      await pacUSD.connect(owner).addToBlocklist(user1.address);
      await expect(
        pacUSD.connect(user2).transferFrom(user1.address, user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert transferFrom to blacklisted recipient", async function () {
      await pacUSD.connect(user1).approve(user2.address, AMOUNT);
      await pacUSD.connect(owner).addToBlocklist(user2.address);
      await expect(
        pacUSD.connect(user2).transferFrom(user1.address, user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert transferFrom when paused", async function () {
      await pacUSD.connect(user1).approve(user2.address, AMOUNT);
      await pacUSD.connect(owner).pause();
      await expect(
        pacUSD.connect(user2).transferFrom(user1.address, user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "EnforcedPause");
    });

    it("should allow transferFrom of zero amount", async function () {
      await pacUSD.connect(user1).approve(user2.address, AMOUNT);
      await expect(
        pacUSD
          .connect(user2)
          .transferFrom(user1.address, user2.address, ZERO_AMOUNT)
      )
        .to.emit(pacUSD, "Transfer")
        .withArgs(user1.address, user2.address, ZERO_AMOUNT);
      expect(await pacUSD.balanceOf(user1.address)).to.equal(AMOUNT);
      expect(await pacUSD.balanceOf(user2.address)).to.equal(0);
    });

    it("should allow max allowance transferFrom", async function () {
      await pacUSD.connect(user1).approve(user2.address, MAX_UINT256);
      await expect(
        pacUSD.connect(user2).transferFrom(user1.address, user2.address, AMOUNT)
      )
        .to.emit(pacUSD, "Transfer")
        .withArgs(user1.address, user2.address, AMOUNT);
      expect(await pacUSD.balanceOf(user2.address)).to.equal(AMOUNT);
      expect(await pacUSD.allowance(user1.address, user2.address)).to.equal(
        MAX_UINT256
      );
    });
  });

  describe("Rescue Tokens (Enhanced with MockERC20)", function () {
    let mockExternalToken: MockERC20; // Use MockERC20 for external token testing

    beforeEach(async function () {
      // Mint initial PacUSD to user1 for base setup
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address);

      // Deploy a MockERC20 token to simulate external ERC20 tokens
      const MockERC20Factory = (await ethers.getContractFactory(
        "MockERC20"
      )) as MockERC20__factory;
      mockExternalToken = await MockERC20Factory.deploy("Mock Token", "MOCK");
      await mockExternalToken.waitForDeployment();

      // Mint initial supply of mock token to owner for distribution
      await mockExternalToken.mint(owner.address, AMOUNT * 10n);
    });

    it("should rescue MockERC20 tokens from contract to valid recipient", async function () {
      // Transfer mock tokens to the PacUSD contract first
      await mockExternalToken.transfer(pacUSD.target, AMOUNT);

      // Grant rescuer role and perform rescue
      await pacUSD.grantRole(await pacUSD.RESCUER_ROLE(), rescuer.address);
      await expect(
        pacUSD
          .connect(rescuer)
          .rescueTokens(mockExternalToken.target, user2.address, AMOUNT)
      )
        .to.emit(pacUSD, "TokensRescued")
        .withArgs(mockExternalToken.target, user2.address, AMOUNT);

      // Verify token balances after rescue
      expect(await mockExternalToken.balanceOf(pacUSD.target)).to.equal(0);
      expect(await mockExternalToken.balanceOf(user2.address)).to.equal(AMOUNT);
    });

    it("should rescue native contract tokens (PacUSD) sent to itself", async function () {
      // Send PacUSD tokens to its own contract address
      await pacUSD.connect(owner).setMintByTx(TX_ID_2);
      await pacUSD.connect(minter).mintByTx(TX_ID_2, AMOUNT, pacUSD.target);

      // Perform rescue of native tokens
      await pacUSD.grantRole(await pacUSD.RESCUER_ROLE(), rescuer.address);
      await expect(
        pacUSD
          .connect(rescuer)
          .rescueTokens(pacUSD.target, user2.address, AMOUNT)
      )
        .to.emit(pacUSD, "TokensRescued")
        .withArgs(pacUSD.target, user2.address, AMOUNT);

      // Verify native token balances
      expect(await pacUSD.balanceOf(pacUSD.target)).to.equal(0);
      expect(await pacUSD.balanceOf(user2.address)).to.equal(AMOUNT);
    });

    it("should revert when rescuing to blacklisted recipient", async function () {
      // Send mock tokens to PacUSD contract
      await mockExternalToken.transfer(pacUSD.target, AMOUNT);
      await pacUSD.grantRole(await pacUSD.RESCUER_ROLE(), rescuer.address);

      // Blacklist the intended recipient
      await pacUSD.connect(owner).addToBlocklist(user2.address);

      // Attempt rescue to blacklisted address should fail
      await expect(
        pacUSD
          .connect(rescuer)
          .rescueTokens(mockExternalToken.target, user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert when rescuing more than available balance", async function () {
      // Send partial amount of mock tokens to contract (50% of AMOUNT)
      const partialAmount = AMOUNT / 2n;
      await mockExternalToken.transfer(pacUSD.target, partialAmount);
      await pacUSD.grantRole(await pacUSD.RESCUER_ROLE(), rescuer.address);

      // Attempt to rescue more than available balance
      await expect(
        pacUSD
          .connect(rescuer)
          .rescueTokens(mockExternalToken.target, user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "InsufficientBalance");
    });

    it("should revert when rescuing from zero address token contract", async function () {
      await pacUSD.grantRole(await pacUSD.RESCUER_ROLE(), rescuer.address);

      // Attempt to rescue from zero address (invalid token contract)
      await expect(
        pacUSD
          .connect(rescuer)
          .rescueTokens(ZERO_ADDRESS, user2.address, AMOUNT)
      ).to.be.reverted; // Fails due to ERC20 interface checks on zero address
    });

    it("should revert when rescuer role is revoked", async function () {
      // Prepare mock tokens in contract and grant/revoke rescuer role
      await mockExternalToken.transfer(pacUSD.target, AMOUNT);
      await pacUSD.grantRole(await pacUSD.RESCUER_ROLE(), rescuer.address);
      await pacUSD.revokeRole(await pacUSD.RESCUER_ROLE(), rescuer.address);

      // Rescuer no longer has permission
      await expect(
        pacUSD
          .connect(rescuer)
          .rescueTokens(mockExternalToken.target, user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(
        pacUSD,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("should handle sequential rescues of different token types", async function () {
      // Prepare both mock token and PacUSD in the contract
      await mockExternalToken.transfer(pacUSD.target, AMOUNT);
      await pacUSD.connect(owner).setMintByTx(TX_ID_2);
      await pacUSD.connect(minter).mintByTx(TX_ID_2, AMOUNT, pacUSD.target);

      await pacUSD.grantRole(await pacUSD.RESCUER_ROLE(), rescuer.address);

      // First rescue mock tokens
      await pacUSD
        .connect(rescuer)
        .rescueTokens(mockExternalToken.target, user2.address, AMOUNT);
      // Then rescue native PacUSD tokens
      await pacUSD
        .connect(rescuer)
        .rescueTokens(pacUSD.target, user2.address, AMOUNT);

      // Verify both rescues succeeded
      expect(await mockExternalToken.balanceOf(pacUSD.target)).to.equal(0);
      expect(await pacUSD.balanceOf(pacUSD.target)).to.equal(0);
      expect(await mockExternalToken.balanceOf(user2.address)).to.equal(AMOUNT);
      expect(await pacUSD.balanceOf(user2.address)).to.equal(AMOUNT);
    });

    it("should revert when rescuing zero amount", async function () {
      await mockExternalToken.transfer(pacUSD.target, AMOUNT);
      await pacUSD.grantRole(await pacUSD.RESCUER_ROLE(), rescuer.address);

      // Attempt to rescue zero amount should fail
      await expect(
        pacUSD
          .connect(rescuer)
          .rescueTokens(mockExternalToken.target, user2.address, ZERO_AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAmount");
    });
  });
  describe("Approve", function () {
    beforeEach(async function () {
      // Mint 100 PacUSD to user1 during setup for approval scenarios
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address);
    });

    it("should allow normal approve", async function () {
      // Test standard approval: user1 approves user2 to spend 100 PacUSD
      await expect(pacUSD.connect(user1).approve(user2.address, AMOUNT))
        .to.emit(pacUSD, "Approval")
        .withArgs(user1.address, user2.address, AMOUNT);
      // Verify the approval amount is set correctly
      expect(await pacUSD.allowance(user1.address, user2.address)).to.equal(
        AMOUNT
      );
    });

    it("should allow approve zero amount to revoke permission", async function () {
      // First approve, then revoke by approving zero amount
      await pacUSD.connect(user1).approve(user2.address, AMOUNT);
      await expect(pacUSD.connect(user1).approve(user2.address, ZERO_AMOUNT))
        .to.emit(pacUSD, "Approval")
        .withArgs(user1.address, user2.address, ZERO_AMOUNT);
      // Verify the approval is revoked
      expect(await pacUSD.allowance(user1.address, user2.address)).to.equal(
        ZERO_AMOUNT
      );
    });

    it("should allow approve max uint256 amount", async function () {
      // Test approval with maximum possible value (common for unlimited allowances)
      await expect(pacUSD.connect(user1).approve(user2.address, MAX_UINT256))
        .to.emit(pacUSD, "Approval")
        .withArgs(user1.address, user2.address, MAX_UINT256);
      expect(await pacUSD.allowance(user1.address, user2.address)).to.equal(
        MAX_UINT256
      );
    });

    it("should revert if approver is blacklisted", async function () {
      // Add the approver (user1) to the blocklist
      await pacUSD.connect(owner).addToBlocklist(user1.address);
      // Approval should fail when the approver is blacklisted
      await expect(
        pacUSD.connect(user1).approve(user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert if spender is blacklisted", async function () {
      // Add the spender (user2) to the blocklist
      await pacUSD.connect(owner).addToBlocklist(user2.address);
      // Approval to a blacklisted address should fail
      await expect(
        pacUSD.connect(user1).approve(user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert if approve when contract is paused", async function () {
      // Approval should fail when the contract is paused
      await pacUSD.connect(owner).pause();
      await expect(
        pacUSD.connect(user1).approve(user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "EnforcedPause");
    });

    it("should revert if approve to zero address", async function () {
      // Approval to zero address should fail (treated as ERC20InvalidSpender)
      await expect(
        pacUSD.connect(user1).approve(ZERO_ADDRESS, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "ERC20InvalidSpender");
    });

    it("should override existing allowance with new value", async function () {
      // Test that a new approval overwrites the existing allowance
      await pacUSD.connect(user1).approve(user2.address, AMOUNT / 2n); // Initial approval of 50
      await pacUSD.connect(user1).approve(user2.address, AMOUNT); // Override with 100
      expect(await pacUSD.allowance(user1.address, user2.address)).to.equal(
        AMOUNT
      );
    });
  });

  describe("Permit", function () {
    beforeEach(async function () {
      // Mint initial tokens to user1 for permit scenarios
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address);
    });

    it("should allow valid permit with signature", async function () {
      const spender = user2.address;
      const value = AMOUNT;
      const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

      // Generate permit signature using user1's private key
      const nonce = await pacUSD.nonces(user1.address);
      const domain = {
        name: NAME,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await pacUSD.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const signature = await user1.signTypedData(domain, types, {
        owner: user1.address,
        spender,
        value,
        nonce,
        deadline,
      });
      const { v, r, s } = ethers.Signature.from(signature);

      // Execute permit with generated signature
      await expect(
        pacUSD.permit(user1.address, spender, value, deadline, v, r, s)
      )
        .to.emit(pacUSD, "Approval")
        .withArgs(user1.address, spender, value);

      // Verify allowance was set correctly
      expect(await pacUSD.allowance(user1.address, spender)).to.equal(value);
      // Verify nonce was incremented
      expect(await pacUSD.nonces(user1.address)).to.equal(nonce + 1n);
    });

    it("should revert when permit deadline has expired", async function () {
      const spender = user2.address;
      const value = AMOUNT;
      const expiredDeadline = Math.floor(Date.now() / 1000) - 3600; // 1 hour ago

      // Generate valid signature but with expired deadline
      const nonce = await pacUSD.nonces(user1.address);
      const domain = {
        name: NAME,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await pacUSD.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const signature = await user1.signTypedData(domain, types, {
        owner: user1.address,
        spender,
        value,
        nonce,
        deadline: expiredDeadline,
      });
      const { v, r, s } = ethers.Signature.from(signature);

      // Expect failure due to expired deadline
      await expect(
        pacUSD.permit(user1.address, spender, value, expiredDeadline, v, r, s)
      ).to.be.revertedWithCustomError(pacUSD, "ERC2612ExpiredSignature");
    });

    it("should revert with invalid signature", async function () {
      const spender = user2.address;
      const value = AMOUNT;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Generate signature with wrong private key (user2 instead of user1)
      const nonce = await pacUSD.nonces(user1.address);
      const domain = {
        name: NAME,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await pacUSD.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const invalidSignature = await user2.signTypedData(domain, types, {
        owner: user1.address,
        spender,
        value,
        nonce,
        deadline,
      });
      const { v, r, s } = ethers.Signature.from(invalidSignature);

      // Expect failure due to invalid signature
      await expect(
        pacUSD.permit(user1.address, spender, value, deadline, v, r, s)
      ).to.be.revertedWithCustomError(pacUSD, "ERC2612InvalidSigner");
    });

    it("should revert when owner is blacklisted", async function () {
      // Blacklist the permit owner (user1)
      await pacUSD.connect(owner).addToBlocklist(user1.address);

      const spender = user2.address;
      const value = AMOUNT;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Generate valid signature
      const nonce = await pacUSD.nonces(user1.address);
      const domain = {
        name: NAME,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await pacUSD.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const signature = await user1.signTypedData(domain, types, {
        owner: user1.address,
        spender,
        value,
        nonce,
        deadline,
      });
      const { v, r, s } = ethers.Signature.from(signature);

      // Expect failure due to blacklisted owner
      await expect(
        pacUSD.permit(user1.address, spender, value, deadline, v, r, s)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert when spender is blacklisted", async function () {
      // Blacklist the permit spender (user2)
      await pacUSD.connect(owner).addToBlocklist(user2.address);

      const spender = user2.address;
      const value = AMOUNT;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Generate valid signature
      const nonce = await pacUSD.nonces(user1.address);
      const domain = {
        name: NAME,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await pacUSD.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const signature = await user1.signTypedData(domain, types, {
        owner: user1.address,
        spender,
        value,
        nonce,
        deadline,
      });
      const { v, r, s } = ethers.Signature.from(signature);

      // Expect failure due to blacklisted spender
      await expect(
        pacUSD.permit(user1.address, spender, value, deadline, v, r, s)
      ).to.be.revertedWithCustomError(pacUSD, "BlocklistedAccount");
    });

    it("should revert when contract is paused", async function () {
      // Pause the contract before permit execution
      await pacUSD.connect(owner).pause();

      const spender = user2.address;
      const value = AMOUNT;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Generate valid signature
      const nonce = await pacUSD.nonces(user1.address);
      const domain = {
        name: NAME,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await pacUSD.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const signature = await user1.signTypedData(domain, types, {
        owner: user1.address,
        spender,
        value,
        nonce,
        deadline,
      });
      const { v, r, s } = ethers.Signature.from(signature);

      // Expect failure due to paused contract
      await expect(
        pacUSD.permit(user1.address, spender, value, deadline, v, r, s)
      ).to.be.revertedWithCustomError(pacUSD, "EnforcedPause");
    });

    it("should revert when reusing nonce", async function () {
      const spender = user2.address;
      const value = AMOUNT;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Generate and execute first valid permit
      const nonce = await pacUSD.nonces(user1.address);
      const domain = {
        name: NAME,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await pacUSD.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const signature = await user1.signTypedData(domain, types, {
        owner: user1.address,
        spender,
        value,
        nonce,
        deadline,
      });
      const { v, r, s } = ethers.Signature.from(signature);
      await pacUSD.permit(user1.address, spender, value, deadline, v, r, s);

      // Try to reuse the same nonce
      await expect(
        pacUSD.permit(user1.address, spender, value, deadline, v, r, s)
      ).to.be.revertedWithCustomError(pacUSD, "ERC2612InvalidSigner");
    });

    it("should allow permit with max uint256 value", async function () {
      const spender = user2.address;
      const value = MAX_UINT256;
      const deadline = Math.floor(Date.now() / 1000) + 3600;

      // Generate permit for maximum allowed value
      const nonce = await pacUSD.nonces(user1.address);
      const domain = {
        name: NAME,
        version: "1",
        chainId: (await ethers.provider.getNetwork()).chainId,
        verifyingContract: await pacUSD.getAddress(),
      };
      const types = {
        Permit: [
          { name: "owner", type: "address" },
          { name: "spender", type: "address" },
          { name: "value", type: "uint256" },
          { name: "nonce", type: "uint256" },
          { name: "deadline", type: "uint256" },
        ],
      };
      const signature = await user1.signTypedData(domain, types, {
        owner: user1.address,
        spender,
        value,
        nonce,
        deadline,
      });
      const { v, r, s } = ethers.Signature.from(signature);

      // Execute permit
      await pacUSD.permit(user1.address, spender, value, deadline, v, r, s);

      // Verify max allowance was set
      expect(await pacUSD.allowance(user1.address, spender)).to.equal(
        MAX_UINT256
      );
    });
  });

  describe("UUPS Upgradeability", function () {
    it("should allow admin to authorize upgrade", async function () {
      const PacUSDV2 = await ethers.getContractFactory("PacUSD", upgrader);
      await expect(
        upgrades.upgradeProxy(pacUSD.target, PacUSDV2, { kind: "uups" })
      ).to.not.be.reverted;
    });

    it("should revert if non-upgrader tries to upgrade", async function () {
      const PacUSDV2 = await ethers.getContractFactory("PacUSD", user1);
      await expect(
        upgrades.upgradeProxy(pacUSD.target, PacUSDV2, { kind: "uups" })
      ).to.be.revertedWithCustomError(pacUSD, "OwnableUnauthorizedAccount");
    });
  });
});
