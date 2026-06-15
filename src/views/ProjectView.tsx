import { useState } from 'react';
import {
  App, Alert, Breadcrumb, Button, Card, Dropdown, Form, Input, Modal, Radio, Select, Empty, Typography,
} from 'antd';
import {
  PlusIcon, DownloadIcon, PdfIcon, DeleteIcon,
  CopyIcon, MoreIcon, EditIcon, YarnIcon, LinkIcon, NotesIcon, VariationIcon,
} from '../icons';
import type { ComponentType } from 'react';
import { useStore } from '../useStore';
import { TopBarSlot } from '../components/TopBar';
import { Thumb } from '../components/Thumb';
import { VersionTag } from '../components/VersionTag';
import { statusLabel } from '../components/versionStatus';
import { exportProjectFile, printProject } from '../core/files';
import { PATTERN_TYPES, activeVersion, isPlaceholderName } from '../core/model';
import type { ProjectVersion, Pattern, ResourceKind, Yarn, LinkRes, NoteRes, VariationRes } from '../core/types';

const { Title } = Typography;

const RES_META: Record<ResourceKind, { title: string; add: string; empty: string; Icon: ComponentType }> = {
  yarns: { title: 'Yarns', add: 'Yarn', empty: 'Track the yarns you used — brand, weight, colour.', Icon: YarnIcon },
  links: { title: 'Links & videos', add: 'Link', empty: 'Tutorial videos and reference links.', Icon: LinkIcon },
  notes: { title: 'Notes & tips', add: 'Note', empty: 'Gotchas, gauge, hooks — anything worth remembering.', Icon: NotesIcon },
  variations: { title: 'Variations', add: 'Variation', empty: 'Colourways and tweaks of this project.', Icon: VariationIcon },
};

type ResItem = Yarn | LinkRes | NoteRes | VariationRes;
type ResForm = Partial<Yarn & LinkRes & NoteRes & VariationRes>;

export function ProjectView() {
  const s = useStore();
  const { modal } = App.useApp();
  const prj = s.currentProject();
  const [newPat, setNewPat] = useState(false);
  const [patForm] = Form.useForm<{ name: string; type: 'granny' | 'round' | 'flat' }>();
  const [res, setRes] = useState<{ kind: ResourceKind; item: ResItem | null } | null>(null);
  const [resForm] = Form.useForm<ResForm>();

  if (!prj) return null;
  const ver = activeVersion(prj);
  const isDraft = ver.status === 'draft';
  const hasDraft = prj.versions.some((v) => v.status === 'draft');

  const publish = () => modal.confirm({
    title: `Publish ${ver.label}?`,
    content: 'This becomes the live version. Any currently published version is marked Outdated.',
    okText: 'Publish', onOk: () => s.publishVersion(prj.id),
  });
  const discard = () => modal.confirm({
    title: `Discard draft ${ver.label}?`,
    content: 'Unpublished changes in this draft will be removed. This can’t be undone.',
    okText: 'Discard draft', okButtonProps: { danger: true }, onOk: () => s.discardDraft(prj.id),
  });
  const startDraft = () => s.createDraft(prj.id);

  const createPattern = () => {
    patForm.validateFields().then((v) => {
      const id = s.createPattern(prj.id, v.name?.trim() || 'Untitled pattern', v.type || 'granny');
      setNewPat(false); patForm.resetFields();
      if (id) s.openPattern(prj.id, id);
    }).catch(() => { /* validation errors are shown inline by the form */ });
  };

  const openRes = (kind: ResourceKind, item: ResItem | null) => setRes({ kind, item });
  const saveRes = () => {
    if (!res) return;
    resForm.validateFields().then((v) => {
      if (res.item) s.updateResource(prj.id, res.kind, res.item.id, v);
      else s.addResource(prj.id, res.kind, v);
      setRes(null);
    }).catch(() => { /* validation errors are shown inline by the form */ });
  };

  return (
    <div className="home">
      <TopBarSlot>
        <Breadcrumb className="crumbs" items={[
          { title: <button className="crumb-link" onClick={() => s.goProjects()}>All projects</button> },
          { title: <span className={'crumb-name' + (isPlaceholderName(prj.name) ? ' name-placeholder' : '')}>{prj.name || 'Untitled project'}</span> },
        ]} />
        <div className="grow" />
        <Button icon={<DownloadIcon />} onClick={() => exportProjectFile(prj)}>Export</Button>
        <Button icon={<PdfIcon />} onClick={() => { void printProject(prj); }}>Printable PDF</Button>
        <Button danger type="text" icon={<DeleteIcon />} onClick={() => modal.confirm({
          title: `Delete “${prj.name}”?`, content: 'Removes the project and all its patterns.',
          okText: 'Delete', okButtonProps: { danger: true }, onOk: () => s.deleteProject(prj.id),
        })}>Delete</Button>
      </TopBarSlot>

      <div className="page">
        <span className="proj-name-wrap" data-value={prj.name}>
          <Input variant="borderless" className={'proj-name' + (isPlaceholderName(prj.name) ? ' name-placeholder' : '')} value={prj.name} onChange={(e) => s.renameProject(prj.id, e.target.value)} onPressEnter={(e) => e.currentTarget.blur()} />
        </span>
        <Input.TextArea variant="borderless" className="proj-desc" autoSize value={prj.description} placeholder="Add a description…" onChange={(e) => s.updateProject(prj.id, { description: e.target.value })} />

        <div className="version-bar">
          <span className="version-label">Version</span>
          <Select size="small" className="version-select" value={prj.activeVersionId}
            onChange={(id) => s.setActiveVersion(prj.id, id)}
            options={prj.versions.map((v) => ({ value: v.id, label: `${v.label} · ${statusLabel(v.status)}` }))} />
          <VersionTag status={ver.status} />
          <div className="grow" />
          {isDraft ? (<>
            {prj.versions.length > 1 && <Button size="small" onClick={discard}>Discard draft</Button>}
            <Button size="small" type="primary" onClick={publish}>Publish</Button>
          </>) : (
            <Button size="small" type="primary" icon={<EditIcon />} onClick={startDraft}>
              {hasDraft ? 'Go to draft' : 'Edit as new draft'}
            </Button>
          )}
        </div>

        {!isDraft && (
          <Alert className="version-readonly" type="info" showIcon
            message="You are viewing a read-only version"
            description={`Version ${ver.label} is ${statusLabel(ver.status).toLowerCase()} and cannot be edited.`} />
        )}

        <section className="section">
          <div className="section-head"><Title level={4}>Patterns</Title>{isDraft && <Button type="primary" icon={<PlusIcon />} onClick={() => setNewPat(true)}>New pattern</Button>}</div>
          {ver.patterns.length === 0 ? (
            <Empty className="section-empty" image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<><div className="empty-head">No patterns {isDraft ? 'yet' : 'in this version'}</div>{isDraft && <p className="muted">Add your first granny square to start charting.</p>}</>}>
              {isDraft && <Button type="primary" icon={<PlusIcon />} onClick={() => setNewPat(true)}>New pattern</Button>}
            </Empty>
          ) : (
            <div className="card-grid">
              {ver.patterns.map((pat: Pattern) => (
                <Card key={pat.id} hoverable className="proj-card" styles={{ body: { padding: 14 } }}
                  cover={<div className="card-cover" onClick={() => s.openPattern(prj.id, pat.id)}><Thumb pattern={pat} /></div>}>
                  <div className="card-row">
                    <div className="card-main" role="button" tabIndex={0} onClick={() => s.openPattern(prj.id, pat.id)}
                      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.openPattern(prj.id, pat.id); } }}>
                      <Card.Meta title={<span className={isPlaceholderName(pat.name) ? 'name-placeholder' : undefined}>{pat.name}</span>} description={`${(PATTERN_TYPES[pat.type] || {}).name || pat.type} · ${pat.stitches.length} stitches`} />
                    </div>
                    {isDraft && <Dropdown trigger={['click']} menu={{
                      items: [
                        { key: 'dup', icon: <CopyIcon />, label: 'Duplicate' },
                        { type: 'divider' },
                        { key: 'del', icon: <DeleteIcon />, label: 'Delete', danger: true },
                      ],
                      onClick: ({ key, domEvent }) => {
                        domEvent.stopPropagation();
                        if (key === 'dup') s.duplicatePattern(prj.id, pat.id);
                        else modal.confirm({ title: `Delete pattern “${pat.name}”?`, okText: 'Delete', okButtonProps: { danger: true }, onOk: () => s.deletePattern(prj.id, pat.id) });
                      },
                    }}>
                      <Button type="text" size="small" aria-label="Pattern actions" icon={<MoreIcon />} onClick={(e) => e.stopPropagation()} />
                    </Dropdown>}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </section>

        <section className="section">
          <div className="section-head"><Title level={4}>Resources</Title></div>
          <div className="res-grid">
            {(Object.keys(RES_META) as ResourceKind[]).map((kind) => {
              const meta = RES_META[kind]; const count = ver.resources[kind].length;
              return (
                <Card key={kind} size="small" className="res-col"
                  title={<span className="res-title"><meta.Icon /> {meta.title}{count > 0 && <span className="res-count">{count}</span>}</span>}
                  extra={isDraft ? <Button size="small" icon={<PlusIcon />} aria-label={`Add ${meta.add.toLowerCase()}`} title={`Add ${meta.add.toLowerCase()}`} onClick={() => openRes(kind, null)} /> : null}>
                  <ResourceList version={ver} kind={kind} readOnly={!isDraft} onEdit={(it) => openRes(kind, it)} onDelete={(id) => s.removeResource(prj.id, kind, id)} />
                </Card>
              );
            })}
          </div>
        </section>
      </div>

      <Modal title="New pattern" open={newPat} onOk={createPattern} okText="Create" onCancel={() => setNewPat(false)} destroyOnHidden>
        <Form form={patForm} layout="vertical" requiredMark={false} initialValues={{ type: 'granny' }}>
          <Form.Item name="name" label="Name"><Input placeholder="e.g. Centre motif" autoFocus /></Form.Item>
          <Form.Item name="type" label="Type">
            <Radio.Group className="type-radios">
              {Object.values(PATTERN_TYPES).map((t) => (
                <Radio key={t.id} value={t.id} disabled={!t.available} className="type-radio">
                  <b>{t.name}</b><span className="muted"> — {t.worked}{t.available ? '' : ' · coming soon'}</span>
                </Radio>
              ))}
            </Radio.Group>
          </Form.Item>
        </Form>
      </Modal>

      <Modal title={res ? `${res.item ? 'Edit' : 'Add'} ${RES_META[res.kind].add.toLowerCase()}` : ''}
        open={!!res} onOk={saveRes} okText={res?.item ? 'Save' : 'Add'} onCancel={() => setRes(null)} destroyOnHidden>
        <Form form={resForm} layout="vertical" requiredMark={false}
          key={res ? (res.item?.id ?? `new-${res.kind}`) : 'none'}
          initialValues={res?.item ?? (res?.kind === 'links' ? { kind: 'video' } : {})}>
          {res?.kind === 'yarns' && <>
            <Form.Item name="name" label="Name"><Input placeholder="e.g. Cotton 8/4" autoFocus /></Form.Item>
            <Form.Item name="brand" label="Brand"><Input /></Form.Item>
            <div className="form-row">
              <Form.Item name="weight" label="Weight"><Input placeholder="DK, worsted…" /></Form.Item>
              <Form.Item name="color" label="Colour name"><Input /></Form.Item>
            </div>
            <Form.Item name="hex" label="Swatch"><Input type="color" className="color-input" /></Form.Item>
            <Form.Item name="notes" label="Notes"><Input.TextArea rows={2} /></Form.Item>
          </>}
          {res?.kind === 'links' && <>
            <Form.Item name="title" label="Title"><Input placeholder="e.g. Magic ring tutorial" autoFocus /></Form.Item>
            <Form.Item name="url" label="URL"><Input placeholder="https://…" /></Form.Item>
            <Form.Item name="kind" label="Kind"><Select options={[{ value: 'video', label: 'Video' }, { value: 'article', label: 'Article' }, { value: 'link', label: 'Link' }]} /></Form.Item>
          </>}
          {(res?.kind === 'notes' || res?.kind === 'variations') && <>
            <Form.Item name="title" label="Title"><Input autoFocus /></Form.Item>
            <Form.Item name="body" label={res?.kind === 'notes' ? 'Note' : 'Details'}><Input.TextArea rows={4} /></Form.Item>
          </>}
        </Form>
      </Modal>
    </div>
  );
}

function ResourceList({ version, kind, readOnly, onEdit, onDelete }: { version: ProjectVersion; kind: ResourceKind; readOnly?: boolean; onEdit: (it: ResItem) => void; onDelete: (id: string) => void; }) {
  const items = version.resources[kind] as ResItem[]; // widen union-of-arrays to array-of-union
  if (!items.length) return <p className="muted small">{readOnly ? 'Nothing here in this version.' : RES_META[kind].empty}</p>;
  return (
    <div className="res-list">
      {items.map((it) => (
        <div key={it.id} className="res-item">
          <div className="res-text">{resourceLine(kind, it)}</div>
          {!readOnly && <div className="res-acts">
            <Button type="text" size="small" icon={<EditIcon />} onClick={() => onEdit(it)} />
            <Button type="text" size="small" danger icon={<DeleteIcon />} onClick={() => onDelete(it.id)} />
          </div>}
        </div>
      ))}
    </div>
  );
}

function resourceLine(kind: ResourceKind, it: ResItem) {
  if (kind === 'yarns') {
    const y = it as Yarn;
    const head = [y.name, y.brand].filter(Boolean).join(' · ') || 'Yarn';
    const sub = [y.weight, y.color].filter(Boolean).join(' · ');
    return <><b>{y.hex ? <span className="swatch" style={{ background: y.hex }} /> : null}{head}</b>{sub && <small>{sub}</small>}{y.notes && <small>{y.notes}</small>}</>;
  }
  if (kind === 'links') {
    const l = it as LinkRes;
    return <><b>{l.title || l.url || 'Link'}</b>{l.url && <a className="res-url" href={l.url} target="_blank" rel="noreferrer">{l.url}</a>}</>;
  }
  const n = it as NoteRes; // notes & variations share the {title, body} shape
  return <><b>{n.title || 'Untitled'}</b>{n.body && <small>{n.body}</small>}</>;
}
