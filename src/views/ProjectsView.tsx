import { useState } from 'react';
import { App, Button, Card, Dropdown, Empty, Form, Input, Modal } from 'antd';
import {
  PlusIcon, ImportIcon, MoreIcon, DownloadIcon, CopyIcon, DeleteIcon,
} from '../icons';
import { useStore } from '../useStore';
import { Logo } from '../Logo';
import { Thumb } from '../components/Thumb';
import { Glyph } from '../components/Glyph';
import { exportProjectFile, importProjectFile } from '../core/files';
import type { Project } from '../core/types';

function fmtDate(iso: string): string {
  try { return new Date(iso).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); }
  catch { return ''; }
}

export function ProjectsView() {
  const s = useStore();
  const { modal } = App.useApp();
  const [newOpen, setNewOpen] = useState(false);
  const [form] = Form.useForm<{ name: string; description?: string }>();
  const projects = s.state.library.projects;

  const create = () => {
    form.validateFields().then((v) => {
      const id = s.createProject(v.name?.trim() || 'Untitled project');
      if (v.description?.trim()) s.updateProject(id, { description: v.description.trim() });
      setNewOpen(false); form.resetFields(); s.openProject(id);
    }).catch(() => { /* validation errors are shown inline by the form */ });
  };

  const onImport = async () => {
    const obj = await importProjectFile();
    if (obj) s.openProject(s.importProject(obj));
  };

  const confirmDelete = (p: Project) => modal.confirm({
    title: `Delete “${p.name}”?`,
    content: 'This removes the project and all its patterns. This can’t be undone.',
    okText: 'Delete', okButtonProps: { danger: true },
    onOk: () => s.deleteProject(p.id),
  });

  return (
    <div className="home">
      <header className="topbar">
        <div className="brand"><Logo className="brand-mark" size={22} /> stitchgrid <span className="brand-sub">studio</span></div>
        <div className="grow" />
        <Button icon={<ImportIcon />} onClick={onImport}>Import…</Button>
        <Button type="primary" icon={<PlusIcon />} onClick={() => setNewOpen(true)}>New project</Button>
      </header>

      <div className="page">
        <p className="tagline">Your crochet workshop — one folder per project, for patterns, yarns, links and notes. Design granny squares the way you crochet them.</p>

        {projects.length ? (
          <div className="card-grid">
            {projects.map((p) => (
              <Card
                key={p.id}
                hoverable
                className="proj-card"
                styles={{ body: { padding: 14 } }}
                cover={<div className="card-cover" onClick={() => s.openProject(p.id)}><Thumb pattern={p.patterns[0]} /></div>}
              >
                <div className="card-row">
                  <div className="card-main" role="button" tabIndex={0} onClick={() => s.openProject(p.id)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); s.openProject(p.id); } }}>
                    <Card.Meta title={p.name} description={`${p.patterns.length} pattern${p.patterns.length === 1 ? '' : 's'} · ${fmtDate(p.updatedAt)}`} />
                  </div>
                  <Dropdown
                    trigger={['click']}
                    menu={{
                      items: [
                        { key: 'export', icon: <DownloadIcon />, label: 'Export to file' },
                        { key: 'dup', icon: <CopyIcon />, label: 'Duplicate' },
                        { type: 'divider' },
                        { key: 'del', icon: <DeleteIcon />, label: 'Delete', danger: true },
                      ],
                      onClick: ({ key, domEvent }) => {
                        domEvent.stopPropagation();
                        if (key === 'export') exportProjectFile(p);
                        else if (key === 'dup') s.duplicateProject(p.id);
                        else if (key === 'del') confirmDelete(p);
                      },
                    }}
                  >
                    <Button type="text" size="small" aria-label="Project actions" icon={<MoreIcon />} onClick={(e) => e.stopPropagation()} />
                  </Dropdown>
                </div>
              </Card>
            ))}
          </div>
        ) : (
          <div className="empty-wrap">
            <Empty
              image={<div className="empty-art"><Glyph type="dc" size={56} /><Glyph type="mr" size={56} /><Glyph type="tr" size={56} /></div>}
              description={<><h2>Start your first project</h2><p className="muted">A project is your folder for everything: patterns, the yarns you used, video links and notes.</p></>}
            >
              <Button type="primary" size="large" icon={<PlusIcon />} onClick={() => setNewOpen(true)}>New project</Button>
            </Empty>
          </div>
        )}
      </div>

      <footer className="home-foot">Saved in your browser · export any project to a file to back it up or share it</footer>

      <Modal title="New project" open={newOpen} onOk={create} okText="Create" onCancel={() => setNewOpen(false)} destroyOnHidden>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={create}>
          <Form.Item name="name" label="Name"><Input placeholder="e.g. Spring blanket" autoFocus /></Form.Item>
          <Form.Item name="description" label="Description"><Input.TextArea rows={2} placeholder="Optional" /></Form.Item>
        </Form>
      </Modal>
    </div>
  );
}
