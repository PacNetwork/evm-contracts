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

  /**
   * @notice Adds a price to the pricer.
   * @dev This function adds a new price entry to the pricer and updates the oracle price if the
   *      provided price is the latest one. The timestamp helps ensure the correct chronological
   *      ordering of prices.
   *
   * @param price     The price to be added.
   * @param timestamp The timestamp associated with the price.
   */
  function addPrice(uint256 price, uint256 timestamp) external;

  /**
   * @notice Updates a price in the pricer.
   * @dev This function allows updating an existing price entry based on the unique priceId.
   *
   * @param priceId The unique identifier for the price to update.
   * @param price   The new price value to set.
   */
  function updatePrice(uint256 priceId, uint256 price) external;

  /**
   * @notice Emitted when a price is added.
   *
   * @param priceId   The unique identifier for the newly added price.
   * @param price     The price that was added.
   * @param timestamp The timestamp associated with the added price.
   */
  event PriceAdded(uint256 indexed priceId, uint256 price, uint256 timestamp);

  /**
   * @notice Emitted when a price is updated.
   *
   * @param priceId  The unique identifier for the price that was updated.
   * @param oldPrice The old price value associated with the priceId.
   * @param newPrice The new price value that replaced the old one.
   */
  event PriceUpdated(
    uint256 indexed priceId,
    uint256 oldPrice,
    uint256 newPrice
  );

  /**
   * @notice Error thrown when an invalid price is provided.
   */
  error InvalidPrice();

  /**
   * @notice Error thrown when a priceId does not exist.
   */
  error PriceIdDoesNotExist();
}
