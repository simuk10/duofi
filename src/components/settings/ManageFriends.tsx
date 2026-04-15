'use client';

import { useState, useEffect } from 'react';
import { getSavedFriends, removeSavedFriend } from '@/lib/saved-friends';
import { Users, X } from 'lucide-react';

export function ManageFriends() {
  const [friends, setFriends] = useState<string[]>([]);

  useEffect(() => {
    setFriends(getSavedFriends());
  }, []);

  const handleRemove = (name: string) => {
    removeSavedFriend(name);
    setFriends((prev) => prev.filter((n) => n !== name));
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Users className="h-4 w-4 text-gray-500" />
        <h3 className="text-sm font-semibold text-gray-900">
          Split Friends
        </h3>
      </div>
      <p className="text-xs text-gray-500">
        Names saved from &ldquo;I Covered This&rdquo; splits. They appear as
        suggestions when you split a new tab.
      </p>

      {friends.length === 0 ? (
        <div className="rounded-xl bg-gray-50 px-4 py-6 text-center">
          <p className="text-sm text-gray-500">
            No saved friends yet. They&apos;ll appear here after your first
            group split.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-gray-100 rounded-xl border border-gray-200 bg-white">
          {friends.map((name) => (
            <div
              key={name}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="text-sm text-gray-900">{name}</span>
              <button
                type="button"
                onClick={() => handleRemove(name)}
                className="flex h-7 w-7 items-center justify-center rounded-full text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
                aria-label={`Remove ${name}`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
