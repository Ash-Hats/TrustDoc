import { ShieldCheck } from "lucide-react";
import { useSearchParams } from "react-router-dom";
import DragDropVerify from "../components/DragDropVerify";
import { verifySignature } from "../utils/verifySignature";
import Card from "../components/ui/Card";

export default function Verify() {
  const [searchParams] = useSearchParams();
  const initialHash = searchParams.get("hash") || "";

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <Card className="animate-fade-in-up">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400/25 to-blue-500/25 text-cyan-200 shadow-glow-cyan">
            <ShieldCheck size={20} />
          </span>
          <div>
            <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Verify Document
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Validate hash integrity, issuer authenticity, signature proof, and blockchain timeline with one drag-and-drop flow.
            </p>
          </div>
        </div>
      </Card>

      <DragDropVerify verifySignature={verifySignature} initialHash={initialHash} />
    </section>
  );
}
