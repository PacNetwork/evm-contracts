// SPDX-License-Identifier: BUSL-1.1

pragma solidity 0.8.28;

/**
 * @title IPricer
 * @notice Interface for a pricing oracle that provides asset prices.
 * @dev This interface defines functions for retrieving, adding, and updating prices,
 *      along with associated events and errors for managing an on-chain price feed.
 */
interface IPricer {
  /**
   * @notice Gets the latest price of the asset.
   * @dev This function returns the most recent price stored in the pricer.
   *
   * @return uint256 The latest price of the asset.
   */
  function getLatestPrice() external view returns (uint256);

  /**
   * @notice Gets the price of the asset at a specific priceId.
   * @dev This function allows querying historical prices based on a unique price identifier.
   *
   * @param priceId The unique identifier for the price.
   *
   * @return uint256 The price of the asset associated with the given priceId.
   */
  function getPrice(uint256 priceId) external view returns (uint256);

}
