// A small status pill for a project version (Draft / Published / Outdated),
// shared by the project list and the project view.
import { Tag } from 'antd';
import type { VersionStatus } from '../core/types';
import { STATUS_META } from './versionStatus';

export function VersionTag({ status, className }: { status: VersionStatus; className?: string }) {
  const m = STATUS_META[status];
  return <Tag color={m.color} className={className}>{m.label}</Tag>;
}
