import "dotenv/config";
import hardhatToolboxViemPlugin from "@nomicfoundation/hardhat-toolbox-viem";
import { defineConfig } from "hardhat/config";

const AMOY_RPC_URL = process.env.AMOY_RPC_URL?.trim();
const PRIVATE_KEY = process.env.PRIVATE_KEY?.trim();

if (!AMOY_RPC_URL) {
  throw new Error("AMOY_RPC_URL is missing in .env");
}

if (!PRIVATE_KEY) {
  throw new Error("PRIVATE_KEY is missing in .env");
}

if (!PRIVATE_KEY.startsWith("0x")) {
  throw new Error("PRIVATE_KEY must start with 0x");
}

export default defineConfig({
  plugins: [hardhatToolboxViemPlugin],
  solidity: {
    version: "0.8.28",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    amoy: {
      type: "http",
      chainType: "l1",
      url: AMOY_RPC_URL,
      accounts: [PRIVATE_KEY],
    },
  },
});