'use client';

import { useState, useEffect } from 'react';
import { AppLayout } from '@/components/layout';
import { AllCategoriesSection } from '@/components/settings/AllCategoriesSection';
import {
  Card,
  Button,
  Input,
} from '@/components/ui';
import { useAuth } from '@/hooks';
import { createClient } from '@/lib/supabase/client';
import { Copy, Check, CreditCard, Upload, LogOut, ChevronRight } from 'lucide-react';
import Link from 'next/link';

export default function SettingsPage() {
  const { household, profile, signOut, refreshUserData } = useAuth();
  const [personAName, setPersonAName] = useState(household?.person_a_name || '');
  const [personBName, setPersonBName] = useState(household?.person_b_name || '');
  const [householdName, setHouseholdName] = useState(household?.name || '');
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');

  const supabase = createClient();

  const handleCopyHouseholdId = async () => {
    if (!household?.id) return;
    await navigator.clipboard.writeText(household.id);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (window.location.hash !== '#all-categories') return;
    const el = document.getElementById('all-categories');
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, []);

  const handleSaveHousehold = async () => {
    if (!household?.id) return;

    setSaving(true);
    setError('');
    setSuccess('');

    try {
      const { error: updateError } = await supabase
        .from('households')
        .update({
          name: householdName,
          person_a_name: personAName,
          person_b_name: personBName,
        })
        .eq('id', household.id);

      if (updateError) throw updateError;

      await refreshUserData();
      setSuccess('Settings saved successfully');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  return (
    <AppLayout>
      {/* Header */}
      <div className="bg-white border-b border-gray-200 px-5 py-4">
        <h1 className="text-xl text-center tracking-tight text-gray-900">Settings</h1>
      </div>

      <div className="flex-1 overflow-y-auto px-4 pt-4 pb-20">
        <div className="space-y-4">
          {/* Profile Card */}
          <Card className="p-5">
            <div className="flex items-center gap-4 mb-4">
              <div className="w-14 h-14 rounded-full gradient-primary flex items-center justify-center">
                <span className="text-xl text-white font-medium">
                  {profile?.name?.charAt(0) || profile?.email?.charAt(0).toUpperCase()}
                </span>
              </div>
              <div>
                <p className="text-base text-gray-900">{profile?.name || 'User'}</p>
                <p className="text-sm text-gray-500">{profile?.email}</p>
                <p className="text-xs text-[#14B8A6] mt-1">
                  {profile?.role === 'person_a'
                    ? household?.person_a_name
                    : household?.person_b_name}
                </p>
              </div>
            </div>
          </Card>

          {/* Quick Actions */}
          <Card className="overflow-hidden">
            <Link
              href="/dashboard/upload"
              className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors border-b border-gray-100"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#14B8A6]/10 flex items-center justify-center">
                  <Upload className="w-5 h-5 text-[#14B8A6]" />
                </div>
                <span className="text-sm text-gray-900">Upload CSV Statement</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </Link>
            <Link
              href="/dashboard/cards"
              className="flex items-center justify-between p-4 hover:bg-gray-50 transition-colors"
            >
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-full bg-[#0891B2]/10 flex items-center justify-center">
                  <CreditCard className="w-5 h-5 text-[#0891B2]" />
                </div>
                <span className="text-sm text-gray-900">Manage Credit Cards</span>
              </div>
              <ChevronRight className="w-5 h-5 text-gray-400" />
            </Link>
          </Card>

          <AllCategoriesSection />

          {/* Household Settings */}
          <Card className="p-5">
            <h3 className="text-sm text-gray-600 mb-4">Household Settings</h3>
            
            {error && (
              <div className="rounded-lg bg-red-50 p-3 text-sm text-[#EF4444] mb-4">
                {error}
              </div>
            )}
            {success && (
              <div className="rounded-lg bg-green-50 p-3 text-sm text-[#10B981] mb-4">
                {success}
              </div>
            )}

            <div className="space-y-4">
              <Input
                label="Household Name"
                value={householdName}
                onChange={(e) => setHouseholdName(e.target.value)}
                placeholder="The Smiths"
              />

              <Input
                label="Person A Name"
                value={personAName}
                onChange={(e) => setPersonAName(e.target.value)}
                placeholder="John"
              />

              <Input
                label="Person B Name"
                value={personBName}
                onChange={(e) => setPersonBName(e.target.value)}
                placeholder="Jane"
              />

              <Button onClick={handleSaveHousehold} loading={saving} className="w-full">
                Save Changes
              </Button>
            </div>
          </Card>

          {/* Invite Partner */}
          <Card className="p-5">
            <h3 className="text-sm text-gray-600 mb-3">Invite Your Partner</h3>
            <p className="text-xs text-gray-500 mb-4">
              Share this ID with your partner so they can join your household.
            </p>

            <div className="flex items-center gap-2">
              <code className="flex-1 rounded-lg bg-gray-100 px-3 py-2.5 text-xs font-mono text-gray-800 truncate">
                {household?.id}
              </code>
              <Button
                variant="outline"
                onClick={handleCopyHouseholdId}
                size="sm"
              >
                {copied ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
            </div>
          </Card>

          {/* Sign Out */}
          <Button
            variant="outline"
            onClick={() => signOut()}
            className="w-full text-[#EF4444] border-[#EF4444]/30 hover:bg-[#EF4444]/5"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sign Out
          </Button>
        </div>
      </div>
    </AppLayout>
  );
}
