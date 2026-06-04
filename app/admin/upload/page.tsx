'use client';

import { useState, useRef } from 'react';

export default function UploadPage() {
  const [secret, setSecret] = useState('');
  const [url, setUrl] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function upload(file: File) {
    setError('');
    setUrl('');
    setUploading(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'x-upload-secret': secret },
        body: form,
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setUrl(data.url);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  }

  function onFiles(files: FileList | null) {
    if (files?.[0]) upload(files[0]);
  }

  function copy() {
    navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <main className="min-h-screen bg-white dark:bg-zinc-950 flex items-center justify-center p-8">
      <div className="w-full max-w-md space-y-6">
        <h1 className="text-xl font-medium text-gray-900 dark:text-zinc-100">
          Upload image
        </h1>

        <div>
          <label className="block text-sm text-gray-600 dark:text-zinc-400 mb-1">
            Upload secret
          </label>
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            placeholder="UPLOAD_SECRET"
            className="w-full rounded-md border border-gray-200 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 py-2 text-sm text-gray-900 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            onFiles(e.dataTransfer.files);
          }}
          onClick={() => inputRef.current?.click()}
          className={`rounded-lg border-2 border-dashed p-12 text-center cursor-pointer transition-colors ${
            dragging
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
              : 'border-gray-200 dark:border-zinc-700 hover:border-gray-400 dark:hover:border-zinc-500'
          }`}
        >
          <p className="text-sm text-gray-500 dark:text-zinc-400">
            {uploading ? 'Uploading…' : 'Drag & drop or click to select'}
          </p>
          <input
            ref={inputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => onFiles(e.target.files)}
          />
        </div>

        {error && <p className="text-sm text-red-500">{error}</p>}

        {url && (
          <div className="rounded-md border border-gray-200 dark:border-zinc-700 p-3 flex items-center justify-between gap-3">
            <span className="text-xs text-gray-700 dark:text-zinc-300 break-all">
              {url}
            </span>
            <button
              onClick={copy}
              className="shrink-0 text-xs px-2.5 py-1 rounded border border-gray-200 dark:border-zinc-700 text-gray-600 dark:text-zinc-400 hover:text-gray-900 dark:hover:text-zinc-100 transition-colors"
            >
              {copied ? 'copied!' : 'copy'}
            </button>
          </div>
        )}
      </div>
    </main>
  );
}
