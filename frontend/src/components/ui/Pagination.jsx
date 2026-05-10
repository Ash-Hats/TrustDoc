import { ChevronLeft, ChevronRight } from "lucide-react";
import Button from "./Button";

export default function Pagination({ page, totalPages, onChange }) {
  return (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="secondary"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="h-9 w-9 p-0"
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </Button>

      <p className="min-w-[70px] text-center text-xs text-gray-400">
        Page {page} / {totalPages}
      </p>

      <Button
        variant="secondary"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="h-9 w-9 p-0"
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </Button>
    </div>
  );
}
