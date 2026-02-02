import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

initializeApp({
  credential: applicationDefault()
});

const db = getFirestore();

async function migrateUserDataToCampaigns(): Promise<void> {
  const usersSnapshot = await db.collection('users').get();

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();
    const email = (userData.email || '').toLowerCase();

    if (!email) {
      console.warn(`Skipping user ${userId} because email is missing.`);
      continue;
    }

    const campaignId = db.collection('campaigns').doc().id;
    const now = new Date().toISOString();
    const campaignRef = db.doc(`campaigns/${campaignId}/metadata`);

    await campaignRef.set({
      id: campaignId,
      name: `${email}'s Campaign`,
      createdAt: now,
      updatedAt: now,
      ownerId: userId,
      ownerEmail: email,
      members: {
        [userId]: {
          role: 'owner',
          email,
          joinedAt: now
        }
      },
      settings: {
        allowMembersToCreateSessions: true
      }
    });

    await db.doc(`users/${userId}`).set(
      {
        uid: userId,
        email,
        campaigns: FieldValue.arrayUnion(campaignId),
        defaultCampaignId: campaignId,
        updatedAt: now
      },
      { merge: true }
    );

    const sessionsSnapshot = await db.collection(`users/${userId}/audioSessions`).get();
    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionData = sessionDoc.data();
      await db.doc(`campaigns/${campaignId}/audioSessions/${sessionDoc.id}`).set({
        ...sessionData,
        campaignId,
        ownerId: userId,
        ownerEmail: email,
        createdBy: userId,
        updatedAt: sessionData.updatedAt || now
      });
    }

    console.log(`Migrated user ${userId} to campaign ${campaignId}`);
  }
}

void migrateUserDataToCampaigns()
  .then(() => {
    console.log('Migration completed');
    process.exit(0);
  })
  .catch(error => {
    console.error('Migration failed', error);
    process.exit(1);
  });
