import { Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useAppContext } from "../context/AppContext";
import Button from "./ui/Button";
import EmptyState from "./ui/EmptyState";

export default function RequireWallet({ children }) {
  const { wallet, connectWallet } = useAppContext();

  if (wallet.status === "connected" && wallet.account) {
    return children;
  }

  return (
    <EmptyState
      title="Wallet Connection Required"
      description="Connect your MetaMask wallet on Polygon Amoy from Settings to access this section."
      action={
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => connectWallet({ requestIfMissing: true, autoSwitch: false })}>
            <Wallet size={14} />
            Quick Connect
          </Button>
          <Link to="/settings">
            <Button variant="secondary">Open Settings</Button>
          </Link>
        </div>
      }
    />
  );
}
