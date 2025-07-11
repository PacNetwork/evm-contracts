import { MMFVault, MockERC20, MockPricer } from "../../../../typechain-types";

export interface MMFProduct {
  mmfToken: MockERC20;
  mmfVault: MMFVault;
  pricer: MockPricer;
}
