import { useStore } from './useStore';
import { ProjectsView } from './views/ProjectsView';
import { ProjectView } from './views/ProjectView';
import { EditorView } from './views/EditorView';

export function App() {
  const s = useStore();
  switch (s.state.ui.view) {
    case 'editor': return <EditorView />;
    case 'project': return <ProjectView />;
    default: return <ProjectsView />;
  }
}
