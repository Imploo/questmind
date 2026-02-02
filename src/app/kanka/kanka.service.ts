import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, forkJoin, of } from 'rxjs';
import { catchError, map, retry } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { KankaApiResponse, KankaEntity, KankaEntityType, KankaSearchResult } from './kanka.models';

const DEFAULT_TYPES: KankaEntityType[] = ['characters', 'locations', 'quests', 'organisations'];

@Injectable({
  providedIn: 'root'
})
export class KankaService {
  private readonly http = inject(HttpClient);
  private readonly cache = new Map<string, { timestamp: number; data: KankaEntity[] }>();

  private get headers(): HttpHeaders {
    return new HttpHeaders({
      Authorization: `Bearer ${environment.kanka.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    });
  }

  isConfigured(): boolean {
    const config = environment.kanka;
    return (
      !!config?.enabled &&
      !!config?.token &&
      config.token !== 'YOUR_KANKA_PERSONAL_ACCESS_TOKEN' &&
      !!config?.campaignId &&
      config.campaignId !== 'YOUR_CAMPAIGN_ID'
    );
  }

  searchEntities(query: string, types: KankaEntityType[] = DEFAULT_TYPES): Observable<KankaSearchResult> {
    if (!this.isConfigured() || !query.trim()) {
      return of(this.emptyResult());
    }

    const requests = types.map(type =>
      this.searchByType(type, query).pipe(catchError(() => of([])))
    );

    return forkJoin(requests).pipe(map(results => this.mergeResults(types, results)));
  }

  searchEntitiesByMentions(
    mentions: string[],
    types: KankaEntityType[] = DEFAULT_TYPES
  ): Observable<KankaSearchResult> {
    if (!this.isConfigured() || mentions.length === 0) {
      return of(this.emptyResult());
    }

    const queries = this.buildSearchQueries(mentions);
    if (queries.length === 0) {
      return of(this.emptyResult());
    }

    const requests = types.map(type =>
      forkJoin(
        queries.map(query => this.searchByType(type, query).pipe(catchError(() => of([]))))
      ).pipe(
        map(results => results.flat()),
        map(results => this.uniqueById(results))
      )
    );

    return forkJoin(requests).pipe(map(results => this.mergeResults(types, results)));
  }

  getEntityDetails(entityId: number, entityType: KankaEntityType): Observable<KankaEntity> {
    if (!this.isConfigured()) {
      return of({ id: entityId, name: 'Unknown', type: entityType });
    }

    const url = `${environment.kanka.apiUrl}/campaigns/${environment.kanka.campaignId}/${entityType}/${entityId}`;
    return this.http
      .get<{ data: KankaEntity }>(url, { headers: this.headers })
      .pipe(
        retry(1),
        map(response => response.data)
      );
  }

  getAllEntities(types: KankaEntityType[] = DEFAULT_TYPES): Observable<KankaSearchResult> {
    if (!this.isConfigured()) {
      return of(this.emptyResult());
    }

    const requests = types.map(type => this.getAllByType(type).pipe(catchError(() => of([]))));
    return forkJoin(requests).pipe(map(results => this.mergeResults(types, results)));
  }

  extractEntityMentions(transcript: string): string[] {
    const words = transcript.split(/\s+/);
    const mentions = new Set<string>();

    for (let i = 0; i < words.length; i += 1) {
      const word = words[i].replace(/[^\w\s]/g, '');

      if (/^[A-Z][a-z]+$/.test(word)) {
        mentions.add(word);
      }

      if (i < words.length - 1) {
        const nextWord = words[i + 1].replace(/[^\w\s]/g, '');
        if (/^[A-Z][a-z]+$/.test(word) && /^[A-Z][a-z]+$/.test(nextWord)) {
          mentions.add(`${word} ${nextWord}`);
        }
      }
    }

    return Array.from(mentions);
  }

  private searchByType(type: KankaEntityType, query: string): Observable<KankaEntity[]> {
    const cacheKey = `${type}:${query.toLowerCase()}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return of(cached);
    }

    const url = `${environment.kanka.apiUrl}/campaigns/${environment.kanka.campaignId}/${type}`;
    return this.http
      .get<KankaApiResponse<KankaEntity>>(url, {
        headers: this.headers,
        params: { name: query }
      })
      .pipe(
        retry(1),
        map(response => response.data || []),
        map(data => this.storeInCache(cacheKey, data))
      );
  }

  private getAllByType(type: KankaEntityType): Observable<KankaEntity[]> {
    const cacheKey = `all:${type}`;
    const cached = this.getFromCache(cacheKey);
    if (cached) {
      return of(cached);
    }

    const url = `${environment.kanka.apiUrl}/campaigns/${environment.kanka.campaignId}/${type}`;
    return this.http
      .get<KankaApiResponse<KankaEntity>>(url, { headers: this.headers })
      .pipe(
        retry(1),
        map(response => response.data || []),
        map(data => this.storeInCache(cacheKey, data))
      );
  }

  private getFromCache(key: string): KankaEntity[] | null {
    const entry = this.cache.get(key);
    if (!entry) {
      return null;
    }
    if (Date.now() - entry.timestamp > environment.kanka.cacheTimeout) {
      this.cache.delete(key);
      return null;
    }
    return entry.data;
  }

  private buildSearchQueries(mentions: string[]): string[] {
    const maxQueries = Math.min(environment.kanka.maxContextEntities || 20, 10);
    const queries = new Set<string>();

    for (const mention of mentions) {
      if (queries.size >= maxQueries) {
        break;
      }
      const trimmed = mention.trim();
      if (!trimmed) {
        continue;
      }
      const tokens = trimmed.split(/\s+/).filter(Boolean);
      if (tokens.length === 1) {
        queries.add(tokens[0]);
        continue;
      }
      const shortQuery = tokens.slice(0, 2).join(' ');
      queries.add(shortQuery);
    }

    return Array.from(queries);
  }

  private uniqueById(entities: KankaEntity[]): KankaEntity[] {
    const mapById = new Map<number, KankaEntity>();
    entities.forEach(entity => {
      if (!mapById.has(entity.id)) {
        mapById.set(entity.id, entity);
      }
    });
    return Array.from(mapById.values());
  }

  private storeInCache(key: string, data: KankaEntity[]): KankaEntity[] {
    this.cache.set(key, { timestamp: Date.now(), data });
    return data;
  }

  private mergeResults(types: KankaEntityType[], results: KankaEntity[][]): KankaSearchResult {
    const result = this.emptyResult();
    types.forEach((type, index) => {
      result[type] = results[index] || [];
    });
    return result;
  }

  private emptyResult(): KankaSearchResult {
    return {
      characters: [],
      locations: [],
      quests: [],
      organisations: []
    };
  }
}
