import { deploy } from "./deploy_contracts";

// Execute the main function and handle exceptions
deploy()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n===== Deployment Failed =====");
    console.error(`Error Type: ${error.name}`);
    console.error(`Error Message: ${error.message}`);
    if (error.code) console.error(`Error Code: ${error.code}`);
    process.exit(1);
  });
