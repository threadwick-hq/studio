// Display metadata for version statuses, shared by VersionTag and the views.
import type { VersionStatus } from '../core/types';

export const STATUS_META: Record<VersionStatus, { label: string; color?: string }> = {
  draft: { label: 'Draft', color: 'gold' },
  published: { label: 'Published', color: 'green' },
  outdated: { label: 'Outdated' }, // default (neutral grey)
};

export function statusLabel(status: VersionStatus): string { return STATUS_META[status].label; }
