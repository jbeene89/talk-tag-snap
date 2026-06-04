import { createFileRoute, Link, useNavigate } from '@tanstack/react-router';
import { useServerFn } from '@tanstack/react-start';
import { useEffect, useState } from 'react';
import { deleteUserAccount } from '@/lib/account.functions';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export const Route = createFileRoute('/delete-account')({
  head: () => ({
    meta: [
      { title: 'Delete Account — SoupyTag' },
      { name: 'description', content: 'Permanently delete your SoupyTag account and all associated data.' },
      { name: 'robots', content: 'noindex' },
    ],
  }),
  component: DeleteAccountPage,
});

function DeleteAccountPage() {
  const navigate = useNavigate();
  const deleteAccount = useServerFn(deleteUserAccount);
  const [email, setEmail] = useState<string | null>(null);
  const [checking, setChecking] = useState(true);
  const [confirmText, setConfirmText] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setEmail(data.user?.email ?? null);
      setChecking(false);
    });
  }, []);

  const handleDelete = async () => {
    setLoading(true);
    setError(null);
    try {
      await deleteAccount();
      await supabase.auth.signOut();
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="mx-auto flex min-h-screen max-w-lg flex-col items-center justify-center px-4 text-center">
        <h1 className="text-2xl font-semibold">Your account has been deleted</h1>
        <p className="mt-3 text-muted-foreground">
          All your data has been permanently removed. We're sorry to see you go.
        </p>
        <Link to="/" className="mt-6">
          <Button>Go home</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg px-4 py-16">
      <h1 className="text-2xl font-semibold">Delete your account</h1>
      <p className="mt-3 text-muted-foreground">
        This will permanently delete your SoupyTag account and all data associated with it,
        including saved tags and image history. This action cannot be undone.
      </p>

      {checking ? (
        <p className="mt-8 text-sm text-muted-foreground">Checking your session…</p>
      ) : !email ? (
        <div className="mt-8 rounded-lg border p-6">
          <p className="text-sm">You need to be signed in to delete your account.</p>
          <Button className="mt-4" onClick={() => navigate({ to: '/login' })}>
            Sign in
          </Button>
        </div>
      ) : (
        <div className="mt-8 space-y-4 rounded-lg border p-6">
          <p className="text-sm">
            Signed in as <span className="font-medium">{email}</span>
          </p>
          <div>
            <label className="text-sm font-medium">
              Type <span className="font-mono">delete</span> to confirm
            </label>
            <Input
              value={confirmText}
              onChange={(e) => setConfirmText(e.target.value)}
              placeholder="delete"
              className="mt-2"
              disabled={loading}
            />
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
          <div className="flex gap-2">
            <Button
              variant="destructive"
              disabled={confirmText.trim().toLowerCase() !== 'delete' || loading}
              onClick={handleDelete}
            >
              {loading ? 'Deleting…' : 'Permanently delete my account'}
            </Button>
            <Link to="/">
              <Button variant="outline" disabled={loading}>Cancel</Button>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
