// SPDX-License-Identifier: BUSL-1.1
pragma solidity 0.8.28;

interface IDeployFactory {
    // Event emitted upon successful deployment
    event ContractsDeployed(address indexed sender, address proxy,address implment);
    // Errors
    error InvalidParams();
    error DeploymentFailed();
    error ZeroAddress();
    error InitializationFailed();
    error ImplAddressError(address expect, address fact);
    error ProxyAddressError(address expect, address fact);
    error Code(address codeHash);
    error NotOwner();
}
