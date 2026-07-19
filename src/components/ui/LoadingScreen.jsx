import { Loader2 } from 'lucide-react';

export function LoadingScreen() {
  return (
    <div className="fixed inset-0 bg-[#0B0C10] flex flex-col items-center justify-center z-50">
      <div className="relative">
        <Loader2 className="w-16 h-16 text-[#66FCF1] animate-spin" />
        <div className="absolute inset-0 border-4 border-[#66FCF1]/20 rounded-full"></div>
      </div>
    </div>
  );
}
