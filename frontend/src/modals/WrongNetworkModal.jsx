import { AlertTriangle } from "lucide-react";
import Button from "../components/ui/Button";
import { AMOY_CHAIN_NAME } from "../utils/contract";

export default function WrongNetworkModal({
  open,
  onClose,
  onSwitchNetwork,
  onDisconnect,
  isSwitching = false,
}) {
  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm">
      <div className="w-full max-w-md rounded-2xl border border-rose-300/25 bg-[#1a1f2e]/95 p-6 shadow-glow-rose">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-rose-500/20 text-rose-200">
            <AlertTriangle size={19} />
          </span>
          <div>
            <h3 className="text-lg font-semibold text-gray-100">Wrong Network</h3>
            <p className="mt-1 text-sm text-gray-400">
              TrustDoc requires <span className="font-semibold text-gray-200">{AMOY_CHAIN_NAME}</span>. Switch your wallet network to continue.
            </p>
          </div>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="secondary" onClick={onClose}>
            Dismiss
          </Button>
          <Button variant="danger" onClick={onDisconnect}>
            Disconnect
          </Button>
          <Button onClick={onSwitchNetwork} disabled={isSwitching}>
            {isSwitching ? "Switching..." : "Switch Network"}
          </Button>
        </div>
      </div>
    </div>
  );
}
