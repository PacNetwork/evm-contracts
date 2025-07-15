// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

contract MockERC20 is ERC20, Ownable {
    constructor(string memory name_, string memory symbol_) 
        ERC20(name_, symbol_)
        Ownable(msg.sender) 
    {
    // await MMFToken.mint(owner, parseEther("1000000"));

        _mint(msg.sender,1000000*1e18);
    }

    function mint(address account, uint256 amount) external onlyOwner {
        _mint(account, amount);
    }
     function decimals() public pure override returns (uint8) {
        return 18;
    }
}