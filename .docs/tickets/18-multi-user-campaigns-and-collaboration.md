# Ticket 18: Multi-User Campaigns and Collaboration

## Overview

Implement a campaign-based collaboration system that allows multiple users to work together on audio sessions. Users can create campaigns, invite others by email, and collaborate with role-based permissions. Audio sessions belong to campaigns and are visible to all campaign members, with specific interaction permissions based on session ownership. Each campaign also has a settings page/modal where a Kanka campaign ID can be configured.

## Current State

**Current Architecture**:

- Audio sessions are stored per user: `users/{userId}/audioSessions/{sessionId}`
- Each user has isolated data
- No sharing or collaboration capabilities
- Single-user workflow only

**Current Limitations**:

1. **No Collaboration**: Users cannot share audio sessions
2. **No Team Workflows**: Cannot work together on campaigns
3. **Isolated Data**: Each user's data is completely separate
4. **No Permission Management**: No concept of different access levels

## Problem Statement

The current single-user model prevents teams from collaborating on D&D campaigns and audio sessions:

1. **Game Master + Players**: DM cannot share session recaps with players
2. **Co-DMs**: Multiple DMs cannot collaborate on same campaign
3. **Campaign Groups**: Players cannot access shared campaign resources
4. **Content Sharing**: No way to share podcasts and stories with party members
5. **Workflow Isolation**: Each user must manage their own sessions independently

**Desired State**:

- Users can create campaigns and invite team members
- All campaign members see all audio sessions in that campaign
- Session owners have full control (regenerate, edit, delete)
- Campaign members have read access and can listen/download podcasts
- Members can edit corrections textbox to provide feedback
- Email-based invitation system with error handling
- Campaign settings page/modal with Kanka campaign ID

## Proposed Solution

Implement a campaign-based data structure with role-based access control and a settings surface for Kanka integration:

### Architecture Changes

```
campaigns/{campaignId}/
  - metadata (name, description, created, owner)
  - members (map of userId -> role)
  - audioSessions/{sessionId}/ (moved from users/{userId}/audioSessions)
    - all session data
    - ownerId (creator of session)
    - permissions
```

### Permission Model

**Campaign Roles**:

- **Owner**: Creator of campaign, full permissions
- **Member**: Invited user, read access + limited write

**Audio Session Permissions**:

| Action                    | Session Owner | Campaign Member |
| ------------------------- | ------------- | --------------- |
| View session              | ✅            | ✅              |
| Listen to podcast         | ✅            | ✅              |
| Download podcast          | ✅            | ✅              |
| Edit corrections textbox  | ✅            | ✅              |
| Regenerate story          | ✅            | ❌              |
| Regenerate podcast        | ✅            | ❌              |
| Upload audio              | ✅            | ❌              |
| Delete session            | ✅            | ❌              |
| Edit metadata             | ✅            | ❌              |
| Create new session        | ✅            | ✅              |
| View transcription status | ✅            | ✅              |
| View/edit user comments   | ✅            | ✅              |

### Invitation System

**Flow**:

1. Campaign owner enters email address
2. System checks if user exists with that email
3. If user exists → add to campaign members
4. If user doesn't exist → show error "User doesn't exist"
5. Invited user sees campaign in their campaigns list

**No Pending Invitations**: Keep it simple - user must already have an account.

## Technical Implementation

### Phase 1: Data Model Changes

**New Data Structure**:

```typescript
// campaigns/{campaignId}/metadata
interface Campaign {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  ownerEmail: string;
  members: {
    [userId: string]: {
      role: 'owner' | 'member';
      email: string;
      joinedAt: Date;
    };
  };
  settings?: {
    allowMembersToCreateSessions: boolean; // default true
    kankaCampaignId?: string; // optional Kanka campaign ID for integrations
  };
}

// campaigns/{campaignId}/audioSessions/{sessionId}
interface AudioSession {
  // ... existing fields ...
  campaignId: string; // NEW
  ownerId: string; // NEW: user who created this session
  ownerEmail: string; // NEW: for display purposes
  createdBy: string; // alias for ownerId

  // Existing fields remain the same
  title: string;
  date: string;
  uploadedAt: Date;
  transcriptionStatus: string;
  // ... rest of fields
}

// users/{userId}/profile
interface UserProfile {
  uid: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  campaigns: string[]; // NEW: array of campaignIds user is member of
  defaultCampaignId?: string; // NEW: last selected campaign
}
```

### Phase 2: Firestore Security Rules

**Update `firestore.rules`**:

```javascript
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    // Helper functions
    function isAuthenticated() {
      return request.auth != null;
    }

    function getUserId() {
      return request.auth.uid;
    }

    function isCampaignMember(campaignId) {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/campaigns/$(campaignId)/metadata) &&
        get(/databases/$(database)/documents/campaigns/$(campaignId)/metadata).data.members[getUserId()] != null;
    }

    function isCampaignOwner(campaignId) {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/campaigns/$(campaignId)/metadata) &&
        get(/databases/$(database)/documents/campaigns/$(campaignId)/metadata).data.ownerId == getUserId();
    }

    function isSessionOwner(campaignId, sessionId) {
      return isAuthenticated() &&
        exists(/databases/$(database)/documents/campaigns/$(campaignId)/audioSessions/$(sessionId)) &&
        get(/databases/$(database)/documents/campaigns/$(campaignId)/audioSessions/$(sessionId)).data.ownerId == getUserId();
    }

    // User profiles
    match /users/{userId} {
      allow read: if isAuthenticated() && getUserId() == userId;
      allow write: if isAuthenticated() && getUserId() == userId;
    }

    // Campaign metadata
    match /campaigns/{campaignId}/metadata {
      // Members can read campaign metadata
      allow read: if isCampaignMember(campaignId);

      // Only owner can create
      allow create: if isAuthenticated() &&
        request.resource.data.ownerId == getUserId();

      // Only owner can update campaign settings
      allow update: if isCampaignOwner(campaignId);

      // Only owner can delete
      allow delete: if isCampaignOwner(campaignId);
    }

    // Audio sessions in campaigns
    match /campaigns/{campaignId}/audioSessions/{sessionId} {
      // All campaign members can read sessions
      allow read: if isCampaignMember(campaignId);

      // Campaign members can create sessions
      allow create: if isCampaignMember(campaignId) &&
        request.resource.data.ownerId == getUserId();

      // Only session owner can update most fields
      // But allow any member to update corrections field
      allow update: if isCampaignMember(campaignId) && (
        isSessionOwner(campaignId, sessionId) ||
        (request.resource.data.diff(resource.data).affectedKeys().hasOnly(['corrections', 'userComments', 'updatedAt']))
      );

      // Only session owner can delete
      allow delete: if isSessionOwner(campaignId, sessionId);
    }

    // Subcollections of audio sessions (transcription chunks, etc.)
    match /campaigns/{campaignId}/audioSessions/{sessionId}/{subcollection=**} {
      allow read: if isCampaignMember(campaignId);
      allow write: if isSessionOwner(campaignId, sessionId);
    }
  }
}
```

### Phase 3: New Services

**Create `campaign.service.ts`**:

```typescript
import { Injectable, inject } from '@angular/core';
import {
  Firestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from '@angular/fire/firestore';
import { Auth } from '@angular/fire/auth';
import { Observable, from, map, switchMap, of } from 'rxjs';

export interface Campaign {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  ownerId: string;
  ownerEmail: string;
  members: {
    [userId: string]: {
      role: 'owner' | 'member';
      email: string;
      joinedAt: Date;
    };
  };
  settings?: {
    allowMembersToCreateSessions: boolean;
  };
}

export interface CampaignMember {
  userId: string;
  role: 'owner' | 'member';
  email: string;
  joinedAt: Date;
}

@Injectable({
  providedIn: 'root',
})
export class CampaignService {
  private readonly firestore = inject(Firestore);
  private readonly auth = inject(Auth);

  /**
   * Create a new campaign
   */
  async createCampaign(name: string, description?: string): Promise<string> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const campaignId = doc(collection(this.firestore, 'campaigns')).id;
    const campaignRef = doc(this.firestore, `campaigns/${campaignId}/metadata`);

    const campaign: Campaign = {
      id: campaignId,
      name,
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
      ownerId: user.uid,
      ownerEmail: user.email!,
      members: {
        [user.uid]: {
          role: 'owner',
          email: user.email!,
          joinedAt: new Date(),
        },
      },
      settings: {
        allowMembersToCreateSessions: true,
      },
    };

    await setDoc(campaignRef, campaign);

    // Add campaign to user's profile
    await this.addCampaignToUserProfile(user.uid, campaignId);

    return campaignId;
  }

  /**
   * Get all campaigns for current user
   */
  getUserCampaigns(): Observable<Campaign[]> {
    const user = this.auth.currentUser;
    if (!user) return of([]);

    // Query all campaigns where user is a member
    const campaignsRef = collection(this.firestore, 'campaigns');

    return from(getDocs(campaignsRef)).pipe(
      map((snapshot) => {
        const campaigns: Campaign[] = [];
        snapshot.forEach((doc) => {
          const data = doc.data();
          // Check if metadata subcollection exists
          const metadataRef = doc.ref.collection('metadata');
          // For now, we'll fetch metadata separately
        });
        return campaigns;
      })
    );
  }

  /**
   * Get campaigns where user is member (helper query)
   */
  async getUserCampaignIds(userId: string): Promise<string[]> {
    const userRef = doc(this.firestore, `users/${userId}`);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) return [];

    return userDoc.data()?.['campaigns'] || [];
  }

  /**
   * Get campaign by ID
   */
  async getCampaign(campaignId: string): Promise<Campaign | null> {
    const campaignRef = doc(this.firestore, `campaigns/${campaignId}/metadata`);
    const campaignDoc = await getDoc(campaignRef);

    if (!campaignDoc.exists()) return null;

    return campaignDoc.data() as Campaign;
  }

  /**
   * Update campaign metadata
   */
  async updateCampaign(
    campaignId: string,
    updates: Partial<Pick<Campaign, 'name' | 'description' | 'settings'>>
  ): Promise<void> {
    const campaignRef = doc(this.firestore, `campaigns/${campaignId}/metadata`);

    await updateDoc(campaignRef, {
      ...updates,
      updatedAt: new Date(),
    });
  }

  /**
   * Invite user to campaign by email
   */
  async inviteUserByCampaignId(campaignId: string, email: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    // Get campaign
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    // Check if current user is owner
    if (campaign.ownerId !== user.uid) {
      throw new Error('Only campaign owner can invite users');
    }

    // Find user by email
    const targetUser = await this.findUserByEmail(email);
    if (!targetUser) {
      throw new Error("User doesn't exist");
    }

    // Check if already a member
    if (campaign.members[targetUser.uid]) {
      throw new Error('User is already a member of this campaign');
    }

    // Add user to campaign members
    const campaignRef = doc(this.firestore, `campaigns/${campaignId}/metadata`);
    await updateDoc(campaignRef, {
      [`members.${targetUser.uid}`]: {
        role: 'member',
        email: targetUser.email,
        joinedAt: new Date(),
      },
      updatedAt: new Date(),
    });

    // Add campaign to user's profile
    await this.addCampaignToUserProfile(targetUser.uid, campaignId);
  }

  /**
   * Remove user from campaign
   */
  async removeMember(campaignId: string, userId: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    // Only owner can remove members (or user can remove themselves)
    if (campaign.ownerId !== user.uid && userId !== user.uid) {
      throw new Error('Only campaign owner can remove members');
    }

    // Cannot remove owner
    if (userId === campaign.ownerId) {
      throw new Error('Cannot remove campaign owner');
    }

    // Remove from campaign
    const campaignRef = doc(this.firestore, `campaigns/${campaignId}/metadata`);
    const updatedMembers = { ...campaign.members };
    delete updatedMembers[userId];

    await updateDoc(campaignRef, {
      members: updatedMembers,
      updatedAt: new Date(),
    });

    // Remove campaign from user's profile
    await this.removeCampaignFromUserProfile(userId, campaignId);
  }

  /**
   * Delete campaign (owner only)
   */
  async deleteCampaign(campaignId: string): Promise<void> {
    const user = this.auth.currentUser;
    if (!user) throw new Error('User not authenticated');

    const campaign = await this.getCampaign(campaignId);
    if (!campaign) throw new Error('Campaign not found');

    if (campaign.ownerId !== user.uid) {
      throw new Error('Only campaign owner can delete campaign');
    }

    // Remove campaign from all members' profiles
    for (const userId of Object.keys(campaign.members)) {
      await this.removeCampaignFromUserProfile(userId, campaignId);
    }

    // Delete campaign metadata
    const campaignRef = doc(this.firestore, `campaigns/${campaignId}/metadata`);
    await deleteDoc(campaignRef);

    // Note: Audio sessions will remain but be inaccessible
    // Could add cleanup job later
  }

  /**
   * Get campaign members
   */
  async getCampaignMembers(campaignId: string): Promise<CampaignMember[]> {
    const campaign = await this.getCampaign(campaignId);
    if (!campaign) return [];

    return Object.entries(campaign.members).map(([userId, data]) => ({
      userId,
      ...data,
    }));
  }

  /**
   * Check if user owns session
   */
  isSessionOwner(session: any, userId: string): boolean {
    return session.ownerId === userId;
  }

  /**
   * Check if user is campaign owner
   */
  isCampaignOwner(campaign: Campaign, userId: string): boolean {
    return campaign.ownerId === userId;
  }

  // --- Helper methods ---

  private async findUserByEmail(email: string): Promise<{ uid: string; email: string } | null> {
    // Query users by email
    const usersRef = collection(this.firestore, 'users');
    const q = query(usersRef, where('email', '==', email));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) return null;

    const userDoc = querySnapshot.docs[0];
    return {
      uid: userDoc.id,
      email: userDoc.data()['email'],
    };
  }

  private async addCampaignToUserProfile(userId: string, campaignId: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${userId}`);
    const userDoc = await getDoc(userRef);

    if (!userDoc.exists()) {
      // Create user profile if doesn't exist
      await setDoc(userRef, {
        uid: userId,
        campaigns: [campaignId],
      });
    } else {
      const campaigns = userDoc.data()['campaigns'] || [];
      if (!campaigns.includes(campaignId)) {
        await updateDoc(userRef, {
          campaigns: [...campaigns, campaignId],
        });
      }
    }
  }

  private async removeCampaignFromUserProfile(userId: string, campaignId: string): Promise<void> {
    const userRef = doc(this.firestore, `users/${userId}`);
    const userDoc = await getDoc(userRef);

    if (userDoc.exists()) {
      const campaigns = userDoc.data()['campaigns'] || [];
      await updateDoc(userRef, {
        campaigns: campaigns.filter((id: string) => id !== campaignId),
      });
    }
  }
}
```

### Phase 4: Update Audio Session Service

**Update `audio-session-state.service.ts`**:

```typescript
// Add campaign context to all operations

async createSession(campaignId: string, title: string, date: string): Promise<string> {
  const user = this.auth.currentUser;
  if (!user) throw new Error('User not authenticated');

  const sessionId = doc(collection(this.firestore, 'temp')).id;
  const sessionRef = doc(this.firestore, `campaigns/${campaignId}/audioSessions/${sessionId}`);

  const session = {
    id: sessionId,
    campaignId,
    ownerId: user.uid,
    ownerEmail: user.email!,
    createdBy: user.uid,
    title,
    date,
    uploadedAt: new Date(),
    transcriptionStatus: 'pending',
    // ... other fields
  };

  await setDoc(sessionRef, session);
  return sessionId;
}

// Update all methods to use campaigns/{campaignId}/audioSessions/{sessionId}
```

### Phase 5: Frontend Components

**Create `campaign-selector.component.ts`**:

```typescript
import { Component, signal, inject, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CampaignService, Campaign } from './campaign.service';
import { Router } from '@angular/router';

@Component({
  selector: 'app-campaign-selector',
  standalone: true,
  imports: [CommonModule, FormsModule],
  template: `
    <div class="p-4 bg-white border-b border-gray-200">
      <div class="flex items-center justify-between max-w-7xl mx-auto">
        <div class="flex items-center gap-4">
          <label class="text-sm font-medium text-gray-700">Campaign:</label>

          <select
            [(ngModel)]="selectedCampaignId"
            (ngModelChange)="onCampaignChange($event)"
            class="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            @for (campaign of campaigns(); track campaign.id) {
            <option [value]="campaign.id">
              {{ campaign.name }}
              @if (isCampaignOwner(campaign)) { (Owner) }
            </option>
            }
          </select>

          <button
            (click)="showCreateCampaign.set(true)"
            class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            + New Campaign
          </button>

          @if (selectedCampaign()) {
          <button
            (click)="showManageCampaign.set(true)"
            class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
          >
            ⚙️ Manage
          </button>
          }
        </div>
      </div>

      <!-- Create Campaign Modal -->
      @if (showCreateCampaign()) {
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-md w-full">
          <h3 class="text-xl font-bold mb-4">Create New Campaign</h3>

          <div class="space-y-4">
            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1">Campaign Name</label>
              <input
                type="text"
                [(ngModel)]="newCampaignName"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                placeholder="My D&D Campaign"
              />
            </div>

            <div>
              <label class="block text-sm font-medium text-gray-700 mb-1"
                >Description (Optional)</label
              >
              <textarea
                [(ngModel)]="newCampaignDescription"
                class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                rows="3"
                placeholder="Description of your campaign..."
              ></textarea>
            </div>
          </div>

          <div class="flex gap-2 mt-6">
            <button
              (click)="createCampaign()"
              [disabled]="!newCampaignName()"
              class="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Create
            </button>
            <button
              (click)="showCreateCampaign.set(false)"
              class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
      }

      <!-- Manage Campaign Modal -->
      @if (showManageCampaign() && selectedCampaign()) {
      <div class="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
        <div class="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[80vh] overflow-y-auto">
          <h3 class="text-xl font-bold mb-4">Manage Campaign: {{ selectedCampaign()!.name }}</h3>

            <!-- Campaign Info -->
          <div class="mb-6 p-4 bg-gray-50 rounded-lg">
            <div class="text-sm text-gray-600 mb-1">Owner</div>
            <div class="font-medium">{{ selectedCampaign()!.ownerEmail }}</div>
          </div>

            <!-- Campaign Settings -->
            <div class="mb-6">
              <h4 class="font-semibold mb-2">Settings</h4>
              <div class="space-y-3">
                <div>
                  <label class="block text-sm font-medium text-gray-700 mb-1">Kanka Campaign ID</label>
                  <input
                    type="text"
                    [(ngModel)]="kankaCampaignId"
                    placeholder="e.g. 123456"
                    class="w-full px-4 py-2 border border-gray-300 rounded-lg"
                  />
                  <p class="text-xs text-gray-500 mt-1">
                    Used for Kanka integration when generating stories.
                  </p>
                </div>
                <button
                  (click)="saveCampaignSettings()"
                  class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                >
                  Save Settings
                </button>
              </div>
            </div>

          <!-- Members List -->
          <div class="mb-6">
            <h4 class="font-semibold mb-2">Members ({{ campaignMembers().length }})</h4>
            <div class="space-y-2">
              @for (member of campaignMembers(); track member.userId) {
              <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                <div>
                  <div class="font-medium">{{ member.email }}</div>
                  <div class="text-xs text-gray-500">{{ member.role }}</div>
                </div>
                @if (isCampaignOwner(selectedCampaign()!) && member.role !== 'owner') {
                <button
                  (click)="removeMember(member.userId)"
                  class="px-3 py-1 text-red-600 hover:bg-red-50 rounded"
                >
                  Remove
                </button>
                }
              </div>
              }
            </div>
          </div>

          <!-- Invite Member -->
          @if (isCampaignOwner(selectedCampaign()!)) {
          <div class="mb-6">
            <h4 class="font-semibold mb-2">Invite Member</h4>
            <div class="flex gap-2">
              <input
                type="email"
                [(ngModel)]="inviteEmail"
                placeholder="user@example.com"
                class="flex-1 px-4 py-2 border border-gray-300 rounded-lg"
              />
              <button
                (click)="inviteMember()"
                [disabled]="!inviteEmail()"
                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                Invite
              </button>
            </div>
            @if (inviteError()) {
            <div class="mt-2 text-sm text-red-600">{{ inviteError() }}</div>
            } @if (inviteSuccess()) {
            <div class="mt-2 text-sm text-green-600">{{ inviteSuccess() }}</div>
            }
          </div>
          }

          <div class="flex gap-2">
            <button
              (click)="showManageCampaign.set(false)"
              class="flex-1 px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
            >
              Close
            </button>
          </div>
        </div>
      </div>
      }
    </div>
  `,
})
export class CampaignSelectorComponent {
  private readonly campaignService = inject(CampaignService);
  private readonly router = inject(Router);

  campaigns = signal<Campaign[]>([]);
  selectedCampaignId = signal<string | null>(null);
  selectedCampaign = signal<Campaign | null>(null);

  showCreateCampaign = signal(false);
  showManageCampaign = signal(false);

  newCampaignName = signal('');
  newCampaignDescription = signal('');

  campaignMembers = signal<any[]>([]);
  inviteEmail = signal('');
  inviteError = signal('');
  inviteSuccess = signal('');
  kankaCampaignId = signal('');

  constructor() {
    this.loadCampaigns();
  }

  async loadCampaigns() {
    // Load campaigns for current user
    // Implementation needed
  }

  async onCampaignChange(campaignId: string) {
    const campaign = await this.campaignService.getCampaign(campaignId);
    this.selectedCampaign.set(campaign);

    this.kankaCampaignId.set(campaign?.settings?.kankaCampaignId || '');

    // Reload campaign members
    const members = await this.campaignService.getCampaignMembers(campaignId);
    this.campaignMembers.set(members);

    // Navigate to campaign view
    this.router.navigate(['/campaign', campaignId]);
  }

  async createCampaign() {
    try {
      const campaignId = await this.campaignService.createCampaign(
        this.newCampaignName(),
        this.newCampaignDescription()
      );

      await this.loadCampaigns();
      this.selectedCampaignId.set(campaignId);
      this.showCreateCampaign.set(false);

      // Reset form
      this.newCampaignName.set('');
      this.newCampaignDescription.set('');
    } catch (error) {
      console.error('Failed to create campaign:', error);
    }
  }

  async inviteMember() {
    this.inviteError.set('');
    this.inviteSuccess.set('');

    try {
      await this.campaignService.inviteUserByCampaignId(
        this.selectedCampaignId()!,
        this.inviteEmail()
      );

      this.inviteSuccess.set('User invited successfully!');
      this.inviteEmail.set('');

      // Reload members
      const members = await this.campaignService.getCampaignMembers(this.selectedCampaignId()!);
      this.campaignMembers.set(members);

      setTimeout(() => this.inviteSuccess.set(''), 3000);
    } catch (error: any) {
      this.inviteError.set(error.message || 'Failed to invite user');
    }
  }

  async saveCampaignSettings() {
    try {
      await this.campaignService.updateCampaign(this.selectedCampaignId()!, {
        settings: {
          ...(this.selectedCampaign()?.settings || {}),
          kankaCampaignId: this.kankaCampaignId(),
        },
      });
    } catch (error) {
      console.error('Failed to save campaign settings:', error);
    }
  }

  async removeMember(userId: string) {
    if (!confirm('Are you sure you want to remove this member?')) return;

    try {
      await this.campaignService.removeMember(this.selectedCampaignId()!, userId);

      // Reload members
      const members = await this.campaignService.getCampaignMembers(this.selectedCampaignId()!);
      this.campaignMembers.set(members);
    } catch (error) {
      console.error('Failed to remove member:', error);
    }
  }

  isCampaignOwner(campaign: Campaign): boolean {
    // Get current user and check
    return false; // Implementation needed
  }
}
```

**Update `audio-session.component.ts`** to show permissions:

```typescript
// Add permission checks to UI

readonly canRegenerateStory = computed(() => {
  const session = this.session();
  const userId = this.auth.currentUser?.uid;
  return session && userId && this.campaignService.isSessionOwner(session, userId);
});

readonly canUploadAudio = computed(() => {
  const session = this.session();
  const userId = this.auth.currentUser?.uid;
  return session && userId && this.campaignService.isSessionOwner(session, userId);
});

readonly canEditCorrections = computed(() => {
  // All campaign members can edit corrections
  return true;
});

// Update template to use these permissions

<button
  (click)="regenerateStory()"
  [disabled]="!canRegenerateStory()"
  class="..."
>
  Regenerate Story
</button>
```

### Phase 6: Storage Rules Update

**Update `storage.rules`**:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {

    // Helper function to check campaign membership
    function isCampaignMember(campaignId) {
      return request.auth != null &&
        firestore.get(/databases/(default)/documents/campaigns/$(campaignId)/metadata).data.members[request.auth.uid] != null;
    }

    // Audio files (campaigns)
    match /campaigns/{campaignId}/audio/{sessionId}/{filename} {
      // Campaign members can read
      allow read: if isCampaignMember(campaignId);

      // Authenticated users can write (checked by backend)
      allow write: if request.auth != null;
    }

    // Podcast files (campaigns)
    match /campaigns/{campaignId}/podcasts/{sessionId}/{filename} {
      // Campaign members can read
      allow read: if isCampaignMember(campaignId);

      // Cloud Functions can write
      allow write: if request.auth != null;
    }
  }
}
```

### Phase 7: Data Migration

**Create migration script for existing users**:

```typescript
// migrate-to-campaigns.ts

async function migrateUserDataToCampaigns() {
  const usersSnapshot = await getDocs(collection(firestore, 'users'));

  for (const userDoc of usersSnapshot.docs) {
    const userId = userDoc.id;
    const userData = userDoc.data();

    // Create personal campaign for each user
    const campaignId = await createCampaign(`${userData.email}'s Campaign`, undefined, userId);

    // Move all audio sessions to campaign
    const sessionsSnapshot = await getDocs(collection(firestore, `users/${userId}/audioSessions`));

    for (const sessionDoc of sessionsSnapshot.docs) {
      const sessionData = sessionDoc.data();

      // Copy to new location with ownerId
      await setDoc(doc(firestore, `campaigns/${campaignId}/audioSessions/${sessionDoc.id}`), {
        ...sessionData,
        campaignId,
        ownerId: userId,
        ownerEmail: userData.email,
      });
    }

    console.log(`Migrated user ${userId} to campaign ${campaignId}`);
  }
}
```

## Implementation Steps

### Step 1: Data Model & Security

- [ ] Define new Firestore structure (campaigns collection)
- [ ] Create Campaign and CampaignMember interfaces
- [ ] Update Firestore security rules
- [ ] Update Storage rules for campaign-based paths
- [ ] Test security rules with Firebase Emulator

### Step 2: Backend Service

- [ ] Create `campaign.service.ts`
- [ ] Implement campaign CRUD operations
- [ ] Implement user invitation by email
- [ ] Implement member management (add/remove)
- [ ] Add permission checking helpers
- [ ] Test service methods

### Step 3: Update Audio Session Service

- [ ] Update `audio-session-state.service.ts` for campaign paths
- [ ] Add campaignId to all session operations
- [ ] Add ownerId tracking for sessions
- [ ] Update storage paths to include campaignId
- [ ] Test session operations

### Step 4: Frontend Components

- [ ] Create `campaign-selector.component.ts`
- [ ] Create `campaign-management.component.ts`
- [ ] Add campaign selector to main navigation
- [ ] Update `audio-session.component.ts` with permissions
- [ ] Add owner badges and permission indicators
- [ ] Add settings section for Kanka campaign ID
- [ ] Test UI flows

### Step 5: Routing & Navigation

- [ ] Add campaign routes (`/campaign/:id`)
- [ ] Update app routing to include campaignId
- [ ] Add campaign guard to protect routes
- [ ] Update navigation to persist selected campaign
- [ ] Test navigation flows

### Step 6: User Profile Integration

- [ ] Create user profile document on first login
- [ ] Store email in user profile
- [ ] Track user's campaigns in profile
- [ ] Add default campaign selection
- [ ] Test profile creation and updates

### Step 7: Email Lookup System

- [ ] Implement email-to-userId lookup query
- [ ] Add email validation
- [ ] Create error handling for non-existent users
- [ ] Test invitation flow
- [ ] Test error scenarios

### Step 8: Data Migration

- [ ] Create migration script
- [ ] Test migration with sample data
- [ ] Backup production data
- [ ] Run migration on production
- [ ] Verify migrated data
- [ ] Remove old user-based sessions (after verification)

### Step 9: Testing & Polish

- [ ] Test campaign creation and deletion
- [ ] Test member invitation (existing users)
- [ ] Test member invitation (non-existent users - error)
- [ ] Test permission enforcement (owner vs member)
- [ ] Test corrections textbox for all members
- [ ] Test podcast download for all members
- [ ] Test session regeneration (owner only)
- [ ] Test on multiple browsers/devices
- [ ] Performance testing with multiple campaigns
- [ ] UI/UX polish

## Success Criteria

- [ ] Users can create multiple campaigns
- [ ] Users can invite others by email (existing users only)
- [ ] Invitation shows error if user doesn't exist
- [ ] Campaign members can see all sessions in campaign
- [ ] Session owners can regenerate/edit their sessions
- [ ] All members can listen/download podcasts
- [ ] All members can edit corrections textbox
- [ ] Campaign settings allow editing Kanka campaign ID
- [ ] Only session owner can regenerate story/podcast
- [ ] Security rules properly enforce permissions
- [ ] Existing user data successfully migrated
- [ ] UI clearly shows ownership and permissions
- [ ] No data loss during migration

## Edge Cases & Considerations

### Security

- [ ] Prevent unauthorized access to campaign data
- [ ] Validate email format before invitation
- [ ] Rate limit invitation requests
- [ ] Prevent campaign owner removal
- [ ] Handle campaign deletion with orphaned sessions

### User Experience

- [ ] Show loading states during invitations
- [ ] Clear error messages for failed invitations
- [ ] Confirmation dialogs for destructive actions
- [ ] Breadcrumb navigation showing current campaign
- [ ] Empty states for campaigns with no sessions
- [ ] Onboarding flow for first-time campaign creation

### Data Integrity

- [ ] Atomic operations for member add/remove
- [ ] Transaction safety for campaign creation
- [ ] Cleanup orphaned data
- [ ] Handle concurrent modifications
- [ ] Backup before migration

### Performance

- [ ] Efficient queries for large campaigns
- [ ] Pagination for campaign member lists
- [ ] Caching campaign metadata
- [ ] Optimize Firestore reads/writes
- [ ] Index optimization for email lookups

## Future Enhancements

1. **Email Pending Invitations**: Allow inviting users who don't have accounts yet
2. **Role Hierarchy**: Add more roles (admin, editor, viewer)
3. **Campaign Templates**: Pre-configured campaign setups
4. **Activity Feed**: Show campaign activity and updates
5. **Notifications**: Notify members of new sessions
6. **Transfer Ownership**: Allow owner to transfer campaign
7. **Duplicate Campaign**: Copy campaign structure
8. **Campaign Settings**: More granular permission controls
9. **Member Comments**: Discussion threads on sessions
10. **Campaign Stats**: Analytics and insights for campaigns

## Estimated Scope

- **Complexity**: High
- **New Files**:
  - `src/app/campaign/campaign.service.ts`
  - `src/app/campaign/campaign.models.ts`
  - `src/app/campaign/campaign-selector.component.ts`
  - `src/app/campaign/campaign-management.component.ts`
  - `src/app/campaign/campaign.guard.ts`
  - `migrations/migrate-to-campaigns.ts`
- **Modified Files**:
  - `firestore.rules` (extensive changes)
  - `storage.rules` (path updates)
  - `audio-session-state.service.ts` (campaign paths)
  - `audio-session.component.ts` (permissions)
  - `app.routes.ts` (campaign routes)
  - All audio-related services (path updates)
- **Infrastructure**: Firestore structure change, security rules overhaul
- **Testing**: Extensive integration testing, migration testing, permission testing
- **Risk**: High (data migration, security rules complexity)

## Dependencies

- **Ticket 07**: Audio Session Transcription (base audio session system)
- **Ticket 08**: Google Auth (user authentication and email)
- **Ticket 16**: Session Podcast Recap Generator (podcast features)

## Status

**Status**: Draft  
**Priority**: High  
**Created**: 2026-02-02  
**Assignee**: TBD  
**Tech Stack**: Firebase Firestore, Angular Signals, RxJS, TypeScript
