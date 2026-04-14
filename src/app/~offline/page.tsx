export default function OfflinePage() {
  return (
    <div className="flex min-h-[100dvh] flex-col items-center justify-center bg-[#F9FAFB] px-6 text-center">
      <h1 className="text-lg font-semibold text-gray-900">You are offline</h1>
      <p className="mt-2 max-w-sm text-sm text-gray-600">
        DuoFi needs a network connection to sign in and sync your household data. Reopen the app
        when you are back online.
      </p>
    </div>
  );
}
