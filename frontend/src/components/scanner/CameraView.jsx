import useScanner from '@/hooks/useScanner';

export default function CameraView({ onResult, enabled }) {
  const { videoRef, error } = useScanner({ onResult, enabled });

  return (
    <div className="relative w-full aspect-video max-w-lg mx-auto rounded-lg overflow-hidden bg-black">
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        autoPlay
        playsInline
        muted
      />
      {/* Scan frame overlay */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
        <div className="w-48 h-48 border-2 border-primary rounded-lg" />
      </div>
      {error && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/80">
          <p className="text-red-400 text-sm text-center px-4">{error}</p>
        </div>
      )}
    </div>
  );
}
