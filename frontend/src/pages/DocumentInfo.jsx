import { FileSearch } from "lucide-react";
import { useParams } from "react-router-dom";
import Card from "../components/ui/Card";
import DragDropVerify from "../components/DragDropVerify";
import { verifySignature } from "../utils/verifySignature";

export default function DocumentInfo() {
  const { hash = "" } = useParams();

  return (
    <section className="mx-auto w-full max-w-5xl space-y-6">
      <Card className="animate-fade-in-up">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-r from-cyan-400/25 to-blue-500/25 text-cyan-200 shadow-glow-cyan">
            <FileSearch size={20} />
          </span>
          <div>
            <h2 className="bg-gradient-to-r from-gray-100 via-gray-200 to-gray-300 bg-clip-text text-3xl font-bold tracking-tight text-transparent">
              Document Information
            </h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-gray-400">
              Public document proof details from blockchain and metadata records.
            </p>
          </div>
        </div>
      </Card>

      <DragDropVerify verifySignature={verifySignature} initialHash={hash} readOnly />
    </section>
  );
}
