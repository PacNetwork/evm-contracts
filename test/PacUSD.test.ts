import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomicfoundation/hardhat-ethers/signers";
import { PacUSD, PacUSD__factory } from "../typechain-types";

describe("PacUSD", function () {
  let pacUSD: PacUSD;
  let owner: SignerWithAddress;
  let admin: SignerWithAddress;
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
      admin,
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
      [owner.address, admin.address, [minter.address, minter2.address]],
      {
        initializer: "initialize",
        kind: "uups",
      }
    )) as unknown as PacUSD;
    await pacUSD.waitForDeployment();

    await pacUSD.grantRole(await pacUSD.PAUSER_ROLE(), owner.address);
    await pacUSD.grantRole(await pacUSD.BLACKLISTER_ROLE(), owner.address);
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
      expect(
        await pacUSD.hasRole(await pacUSD.DEFAULT_ADMIN_ROLE(), owner.address)
      ).to.be.true;
      expect(await pacUSD.hasRole(await pacUSD.PAUSER_ROLE(), owner.address)).to
        .be.true;
      expect(
        await pacUSD.hasRole(await pacUSD.BLACKLISTER_ROLE(), owner.address)
      ).to.be.true;
      expect(await pacUSD.hasRole(await pacUSD.APPROVER_ROLE(), owner.address))
        .to.be.true;
      expect(await pacUSD.hasRole(await pacUSD.RESCUER_ROLE(), owner.address))
        .to.be.true;
    });


    it("should skip zero address minters during initialization", async function () {
      const PacUSD = (await ethers.getContractFactory(
        "PacUSD"
      )) as PacUSD__factory;
      const newPacUSD = (await upgrades.deployProxy(
        PacUSD,
        [owner.address,admin.address, [minter.address, ZERO_ADDRESS]],
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
        .grantRole(await pacUSD.BLACKLISTER_ROLE(), user1.address);
      expect(await pacUSD.hasRole(await pacUSD.PAUSER_ROLE(), user1.address)).to
        .be.true;
      expect(
        await pacUSD.hasRole(await pacUSD.BLACKLISTER_ROLE(), user1.address)
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
    it("should allow blacklister to blacklist an account", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.BLACKLISTER_ROLE(), blacklister.address);
      await expect(pacUSD.connect(blacklister).blacklist(user1.address))
        .to.emit(pacUSD, "Blacklisted")
        .withArgs(user1.address);
      expect(await pacUSD.isBlacklisted(user1.address)).to.be.true;
    });

    it("should revert if blacklisting zero address", async function () {
      await expect(
        pacUSD.connect(owner).blacklist(ZERO_ADDRESS)
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
    });

    it("should revert if non-blacklister tries to blacklist", async function () {
      await expect(
        pacUSD.connect(user1).blacklist(user2.address)
      ).to.be.revertedWithCustomError(
        pacUSD,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("should allow blacklister to unblacklist an account", async function () {
      await pacUSD.connect(owner).blacklist(user1.address);
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.BLACKLISTER_ROLE(), blacklister.address);
      await expect(pacUSD.connect(blacklister).unblacklist(user1.address))
        .to.emit(pacUSD, "Unblacklisted")
        .withArgs(user1.address);
      expect(await pacUSD.isBlacklisted(user1.address)).to.be.false;
    });

    it("should revert if unblacklisting zero address", async function () {
      await expect(
        pacUSD.connect(owner).unblacklist(ZERO_ADDRESS)
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
      await pacUSD.connect(owner).blacklist(user1.address);
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await expect(
        pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "BlacklistedRecipient");
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
      await pacUSD.connect(owner).pause();
      await pacUSD.connect(owner).setMintByTx(TX_ID);
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
      await pacUSD.connect(owner).blacklist(user1.address);
      await expect(
        pacUSD.connect(minter).mintReward(AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "BlacklistedRecipient");
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
      await pacUSD.connect(owner).blacklist(user1.address);
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
      await expect(
        pacUSD.connect(minter).burnByTx(TX_ID_2, AMOUNT, user1.address)
      ).to.be.revertedWithCustomError(pacUSD, "BlacklistedSender");
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
      await pacUSD.connect(owner).pause();
      await pacUSD.connect(owner).setBurnByTx(TX_ID_2);
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

    it("should revert if transfer from blacklisted sender", async function () {
      await pacUSD.connect(owner).blacklist(user1.address);
      await expect(
        pacUSD.connect(user1).transfer(user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlacklistedSender");
    });

    it("should revert if transfer to blacklisted recipient", async function () {
      await pacUSD.connect(owner).blacklist(user2.address);
      await expect(
        pacUSD.connect(user1).transfer(user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlacklistedRecipient");
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
      await pacUSD.connect(owner).blacklist(user1.address);
      await expect(
        pacUSD.connect(user2).transferFrom(user1.address, user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlacklistedSender");
    });

    it("should revert transferFrom to blacklisted recipient", async function () {
      await pacUSD.connect(user1).approve(user2.address, AMOUNT);
      await pacUSD.connect(owner).blacklist(user2.address);
      await expect(
        pacUSD.connect(user2).transferFrom(user1.address, user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "BlacklistedRecipient");
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

  describe("Rescue Tokens", function () {
    beforeEach(async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID);
      await pacUSD.connect(minter).mintByTx(TX_ID, AMOUNT, user1.address);
    });

    it("should allow rescuer to rescue tokens from blacklisted account", async function () {
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.RESCUER_ROLE(), rescuer.address);
      await pacUSD.connect(owner).blacklist(user1.address);
      await expect(
        pacUSD
          .connect(rescuer)
          .rescueTokens(user1.address, user2.address, AMOUNT)
      )
        .to.emit(pacUSD, "TokensRescued")
        .withArgs(user1.address, user2.address, AMOUNT);
      expect(await pacUSD.balanceOf(user1.address)).to.equal(0);
      expect(await pacUSD.balanceOf(user2.address)).to.equal(AMOUNT);
    });

    it("should allow rescuer to rescue tokens from contract itself", async function () {
      await pacUSD.connect(owner).setMintByTx(TX_ID_2);
      await pacUSD.connect(minter).mintByTx(TX_ID_2, AMOUNT, pacUSD.target);
      await pacUSD
        .connect(owner)
        .grantRole(await pacUSD.RESCUER_ROLE(), rescuer.address);
      await expect(
        pacUSD
          .connect(rescuer)
          .rescueTokens(pacUSD.target, user2.address, AMOUNT)
      )
        .to.emit(pacUSD, "TokensRescued")
        .withArgs(pacUSD.target, user2.address, AMOUNT);
      expect(await pacUSD.balanceOf(pacUSD.target)).to.equal(0);
      expect(await pacUSD.balanceOf(user2.address)).to.equal(AMOUNT);
    });

    it("should revert if non-rescuer tries to rescue tokens", async function () {
      await pacUSD.connect(owner).blacklist(user1.address);
      await expect(
        pacUSD.connect(user1).rescueTokens(user1.address, user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(
        pacUSD,
        "AccessControlUnauthorizedAccount"
      );
    });

    it("should revert if rescuing from non-blacklisted account (not contract)", async function () {
      await expect(
        pacUSD.connect(owner).rescueTokens(user1.address, user2.address, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "InvalidRescueSource");
    });

    it("should revert if rescuing to zero address", async function () {
      await pacUSD.connect(owner).blacklist(user1.address);
      await expect(
        pacUSD.connect(owner).rescueTokens(user1.address, ZERO_ADDRESS, AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "ZeroAddress");
    });

    it("should revert if rescuing zero amount", async function () {
      await pacUSD.connect(owner).blacklist(user1.address);
      await expect(
        pacUSD
          .connect(owner)
          .rescueTokens(user1.address, user2.address, ZERO_AMOUNT)
      ).to.be.revertedWithCustomError(pacUSD, "InsufficientBalance");
    });

    it("should revert if rescuing more than balance", async function () {
      await pacUSD.connect(owner).blacklist(user1.address);
      await expect(
        pacUSD
          .connect(owner)
          .rescueTokens(user1.address, user2.address, AMOUNT + 1n)
      ).to.be.revertedWithCustomError(pacUSD, "InsufficientBalance");
    });
  });

  describe("UUPS Upgradeability", function () {
    it("should allow admin to authorize upgrade", async function () {
      const PacUSDV2 = await ethers.getContractFactory("PacUSD",admin);
      await expect(
        upgrades.upgradeProxy(pacUSD.target, PacUSDV2, { kind: "uups" })
      ).to.not.be.reverted;
    });

    it("should revert if non-admin tries to upgrade", async function () {
      const PacUSDV2 = await ethers.getContractFactory("PacUSD", user1);
      await expect(
        upgrades.upgradeProxy(pacUSD.target, PacUSDV2, { kind: "uups" })
      ).to.be.revertedWithCustomError(
        pacUSD,
        "OwnableUnauthorizedAccount"
      );
    });
  });
});
