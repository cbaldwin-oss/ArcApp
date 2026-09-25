import type { ReactNode } from 'react'
import { Maximize2, Pencil, Trash2 } from 'lucide-react'
import type { Team, Todo } from '../types'
import { todoTagLabel, todoDueDisplay, todoAssignmentLabel } from '../utils'

type TodoListProps = {
  todos: Todo[]
  onToggle: (id: string) => void
  /** Team roster, used only to resolve assignedTeamId -> a display name. Omit to hide assignment. */
  teams?: Team[]
  /** Omit either to hide that action — the compact Dashboard widget passes neither. */
  onEdit?: (todo: Todo) => void
  onDelete?: (id: string) => void
}

export function TodoList({ todos, onToggle, teams = [], onEdit, onDelete }: TodoListProps) {
  return (
    <div className="todo-list">
      {todos.map((t) => {
        const due = todoDueDisplay(t)
        const assignment = todoAssignmentLabel(t, teams)
        return (
          <div key={t.id} className={t.done ? 'todo-item done' : 'todo-item'}>
            <div className={t.done ? 'todo-check checked' : 'todo-check'} onClick={() => onToggle(t.id)} />
            <div className="todo-main">
              <p className="todo-text">{t.text}</p>
              <div className="todo-meta">
                <span className={`tag ${t.tag}`}>{todoTagLabel(t.tag)}</span>
                {t.sys && <span className="todo-sys">{t.sys}</span>}
                <span className={due.today ? 'todo-due today' : 'todo-due'}>{due.text}</span>
                {assignment && <span className="todo-assigned">{assignment}</span>}
              </div>
            </div>
            {(onEdit || onDelete) && (
              <div className="todo-actions">
                {onEdit && (
                  <button className="icon-btn" title="Edit" onClick={() => onEdit(t)} aria-label="Edit task">
                    <Pencil style={{ width: 14, height: 14 }} />
                  </button>
                )}
                {onDelete && (
                  <button className="icon-btn" title="Delete" onClick={() => onDelete(t.id)} aria-label="Delete task">
                    <Trash2 style={{ width: 14, height: 14 }} />
                  </button>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

type TodoPanelProps = {
  todos: Todo[]
  onToggle: (id: string) => void
  onExpand: () => void
  /** Checklist/Issue/NETA "My Tasks" rows + default-assignee summary cards (see useOpenItemsData
   * in AppShell.tsx) — rendered above the manual task list, same as the full To-Do page does, so
   * these notices show up here too instead of only appearing once you open the To-Do page. */
  extraRows?: ReactNode
  /** How many of the above count toward the header's "N open" — kept separate from `todos.length`
   * since these aren't Todo records and have no `done` state to filter on. */
  extraOpenCount?: number
}

export default function TodoPanel({ todos, onToggle, onExpand, extraRows, extraOpenCount = 0 }: TodoPanelProps) {
  const open = todos.filter((t) => !t.done).length + extraOpenCount
  return (
    <section className="panel" id="todo">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Your To-Dos</h2>
          <span className="panel-count">{open} open</span>
        </div>
        <div className="panel-header-right">
          <button className="icon-btn" title="Expand" onClick={onExpand} aria-label="Expand to-dos">
            <Maximize2 />
          </button>
        </div>
      </div>
      <div className="panel-body">
        {extraRows}
        <TodoList todos={todos} onToggle={onToggle} />
      </div>
    </section>
  )
}
