import { network } from "hardhat";

async function main() {
  const { viem, networkName } = await network.connect();
  const [deployer] = await viem.getWalletClients();

  if (!deployer?.account?.address) {
    throw new Error("No deployer wallet found. Check PRIVATE_KEY in .env");
  }

  console.log(`Deploying DocumentRegistry to ${networkName}...`);
  console.log(`Deployer address: ${deployer.account.address}`);

  const deployedContract = await viem.deployContract("DocumentRegistry");

  console.log(`Deployment tx hash: ${deployedContract.deploymentTransaction?.hash ?? "N/A"}`);
  console.log(`Contract address: ${deployedContract.address}`);
}

main().catch((error) => {
  console.error("Deployment failed:");
  console.error(error);
  process.exitCode = 1;
});