/// <reference lib="webworker" />

// Import Angular's service worker for PWA caching functionality
importScripts('./ngsw-worker.js');

const METADATA_CACHE = 'bg-upload-metadata';
const FINALIZE_ENDPOINT_PATTERN = /\/finalizeUpload$/;

// ─── Background Fetch Event Handlers ───────────────────────────────────────────

/**
 * Fires when a background fetch completes successfully.
 * Calls the finalizeUpload endpoint to verify the file and trigger transcription.
 */
self.addEventListener('backgroundfetchsuccess', (event) => {
  event.waitUntil(handleBackgroundFetchSuccess(event));
});

/**
 * Fires when a background fetch fails.
 * Notifies open clients so they can show an error.
 */
self.addEventListener('backgroundfetchfail', (event) => {
  event.waitUntil(handleBackgroundFetchFail(event));
});

/**
 * Fires when a background fetch is aborted by the user.
 * Cleans up stored metadata and notifies clients.
 */
self.addEventListener('backgroundfetchabort', (event) => {
  event.waitUntil(handleBackgroundFetchAbort(event));
});

/**
 * Fires when the user clicks the browser's background fetch notification.
 * Opens the app to the relevant session page.
 */
self.addEventListener('backgroundfetchclick', (event) => {
  event.waitUntil(handleBackgroundFetchClick(event));
});

/**
 * Receives metadata from the Angular app before a background upload starts.
 */
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'STORE_UPLOAD_METADATA') {
    const { fetchId, metadata } = event.data;
    storeMetadata(fetchId, metadata).then(() => {
      if (event.ports && event.ports[0]) {
        event.ports[0].postMessage({ stored: true });
      }
    });
  }
});

// ─── Handler Implementations ────────────────────────────────────────────────────

async function handleBackgroundFetchSuccess(event) {
  const registration = event.registration;
  const fetchId = registration.id;

  try {
    const metadata = await getMetadata(fetchId);
    if (!metadata) {
      console.error('[SW] No metadata found for fetch:', fetchId);
      return;
    }

    // Call finalizeUpload endpoint
    const response = await fetch(metadata.finalizeUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        campaignId: metadata.campaignId,
        sessionId: metadata.sessionId,
        storagePath: metadata.storagePath,
        transcriptionMode: metadata.transcriptionMode,
        audioFileName: metadata.audioFileName,
        userCorrections: metadata.userCorrections,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('[SW] finalizeUpload failed:', response.status, errorText);
      notifyClients(fetchId, 'UPLOAD_FAILED', {
        sessionId: metadata.sessionId,
        error: `Finalization failed: ${response.status}`,
      });
      return;
    }

    // Show success notification (if permitted)
    await showNotificationIfPermitted('QuestMind', {
      body: 'Audio upload complete! Transcription has started.',
      icon: '/icons/icon-192x192.png',
      tag: `upload-${fetchId}`,
      data: {
        campaignId: metadata.campaignId,
        sessionId: metadata.sessionId,
      },
    });

    // Notify open clients
    notifyClients(fetchId, 'UPLOAD_COMPLETE', {
      sessionId: metadata.sessionId,
      campaignId: metadata.campaignId,
    });
  } finally {
    await clearMetadata(fetchId);
    event.updateUI({ title: 'Upload complete' });
  }
}

async function handleBackgroundFetchFail(event) {
  const fetchId = event.registration.id;
  const metadata = await getMetadata(fetchId);

  await showNotificationIfPermitted('QuestMind', {
    body: 'Audio upload failed. Please try again.',
    icon: '/icons/icon-192x192.png',
    tag: `upload-${fetchId}`,
    data: metadata
      ? { campaignId: metadata.campaignId, sessionId: metadata.sessionId }
      : {},
  });

  notifyClients(fetchId, 'UPLOAD_FAILED', {
    sessionId: metadata?.sessionId,
    error: 'Background upload failed',
  });

  await clearMetadata(fetchId);
  event.updateUI({ title: 'Upload failed' });
}

async function handleBackgroundFetchAbort(event) {
  const fetchId = event.registration.id;
  const metadata = await getMetadata(fetchId);

  notifyClients(fetchId, 'UPLOAD_ABORTED', {
    sessionId: metadata?.sessionId,
  });

  await clearMetadata(fetchId);
}

async function handleBackgroundFetchClick(event) {
  const fetchId = event.registration.id;
  const metadata = await getMetadata(fetchId);

  const clients = await self.clients.matchAll({ type: 'window' });

  if (metadata) {
    const targetUrl = `/campaign/${metadata.campaignId}/audio/${metadata.sessionId}`;

    if (clients.length > 0) {
      await clients[0].focus();
      clients[0].navigate(targetUrl);
    } else {
      await self.clients.openWindow(targetUrl);
    }
  } else if (clients.length > 0) {
    await clients[0].focus();
  } else {
    await self.clients.openWindow('/');
  }
}

// ─── Metadata Storage (Cache API) ──────────────────────────────────────────────

async function storeMetadata(fetchId, metadata) {
  const cache = await caches.open(METADATA_CACHE);
  const response = new Response(JSON.stringify(metadata));
  await cache.put(`/_bg-upload/${fetchId}`, response);
}

async function getMetadata(fetchId) {
  const cache = await caches.open(METADATA_CACHE);
  const response = await cache.match(`/_bg-upload/${fetchId}`);
  if (!response) return null;
  return response.json();
}

async function clearMetadata(fetchId) {
  const cache = await caches.open(METADATA_CACHE);
  await cache.delete(`/_bg-upload/${fetchId}`);
}

async function showNotificationIfPermitted(title, options) {
  if (!('Notification' in self) || Notification.permission !== 'granted') {
    return false;
  }
  await self.registration.showNotification(title, options);
  return true;
}

// ─── Client Notification ────────────────────────────────────────────────────────

async function notifyClients(fetchId, type, data) {
  const clients = await self.clients.matchAll({ type: 'window' });
  for (const client of clients) {
    client.postMessage({ type, fetchId, ...data });
  }
}
