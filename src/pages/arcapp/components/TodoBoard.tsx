import { ChevronLeft, ChevronRight, Pencil, Trash2 } from 'lucide-react'
import type { Team, TaskStatus, Todo } from '../types'
import { todoTagLabel, todoDueDisplay, todoAssignmentLabel } from '../utils'

const COLUMNS: { status: TaskStatus; label: string }[] = [
  { status: 'todo', label: 'To Do' },
  { status: 'in_progress', label: 'In Progress' },
  { status: 'done', label: 'Done' },
]

type Props = {
  todos: Todo[]
  teams: Team[]
  onMoveStatus: (id: string, status: TaskStatus) => void
  onEdit: (todo: Todo) => void
  onDelete: (id: string) => void
}

/**
 * The To-Do list's alternate view — a fixed To Do / In Progress / Done board, added alongside the
 * original flat list (TodoPanel's TodoList) rather than replacing it, same List/Board toggle
 * pattern as Joint Pack Photos' Asset List/Photo Gallery. Cards move between columns via the
 * ‹/› buttons rather than drag-and-drop — this app runs on iPad, where native HTML5 drag-and-drop
 * doesn't work reliably from touch, so a button that always works everywhere beat a drag
 * interaction that wouldn't.
 */
export default function TodoBoard({ todos, teams, onMoveStatus, onEdit, onDelete }: Props) {
  return (
    <div className="kanban-board">
      {COLUMNS.map((col, colIndex) => {
        const cardsInCol = todos.filter((t) => t.status === col.status)
        return (
          <div key={col.status} className="kanban-col">
            <div className="kanban-col-header">
              <span className="kanban-col-title">{col.label}</span>
              <span className="kanban-col-count">{cardsInCol.length}</span>
            </div>
            <div className="kanban-cards">
              {cardsInCol.length === 0 && <div className="kanban-empty">Nothing here.</div>}
              {cardsInCol.map((t) => {
                const due = todoDueDisplay(t)
                const assignment = todoAssignmentLabel(t, teams)
                const prevCol = COLUMNS[colIndex - 1]
                const nextCol = COLUMNS[colIndex + 1]
                return (
                  <div key={t.id} className="kanban-card">
                    <p className="kanban-card-text">{t.text}</p>
                    <div className="todo-meta">
                      <span className={`tag ${t.tag}`}>{todoTagLabel(t.tag)}</span>
                      {t.sys && <span className="todo-sys">{t.sys}</span>}
                      <span className={due.today ? 'todo-due today' : 'todo-due'}>{due.text}</span>
                      {assignment && <span className="todo-assigned">{assignment}</span>}
                    </div>
                    <div className="kanban-card-footer">
                      <div className="kanban-move-group">
                        <button
                          type="button"
                          className="kanban-move-btn"
                          disabled={!prevCol}
                          title={prevCol ? `Move to ${prevCol.label}` : undefined}
                          aria-label="Move to previous column"
                          onClick={() => prevCol && onMoveStatus(t.id, prevCol.status)}
                        >
                          <ChevronLeft style={{ width: 14, height: 14 }} />
                        </button>
                        <button
                          type="button"
                          className="kanban-move-btn"
                          disabled={!nextCol}
                          title={nextCol ? `Move to ${nextCol.label}` : undefined}
                          aria-label="Move to next column"
                          onClick={() => nextCol && onMoveStatus(t.id, nextCol.status)}
                        >
                          <ChevronRight style={{ width: 14, height: 14 }} />
                        </button>
                      </div>
                      <div className="todo-actions">
                        <button className="icon-btn" title="Edit" onClick={() => onEdit(t)} aria-label="Edit task">
                          <Pencil />
                        </button>
                        <button className="icon-btn" title="Delete" onClick={() => onDelete(t.id)} aria-label="Delete task">
                          <Trash2 />
                        </button>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}
