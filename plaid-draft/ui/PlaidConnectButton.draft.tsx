/**
 * DRAFT — React Link button sketch (not imported anywhere).
 *
 * Usage when wired:
 *   import { usePlaidLink } from 'react-plaid-link';
 *   const { open } = usePlaidLink({ token: linkToken, onSuccess: ... });
 */
export function PlaidConnectButtonDraft(props: {
  onConnect: () => void;
  loading?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={props.onConnect}
      disabled={props.loading}
      className="rounded-xl bg-[#14B8A6] px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
    >
      {props.loading ? "Connecting…" : "Connect bank (Plaid)"}
    </button>
  );
}

// onSuccess flow (pseudocode):
// 1. fetch('/api/plaid/link-token') → link_token
// 2. Plaid Link opens
// 3. onSuccess(public_token) → fetch('/api/plaid/exchange', { public_token, paid_by })
// 4. refetch transactions — no further Plaid calls until webhook/cron
