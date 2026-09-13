import { Maximize2 } from 'lucide-react'
import type { Todo } from '../types'

export function TodoList({ todos, onToggle }: { todos: Todo[]; onToggle: (id: number) => void }) {
  return (
    <div className="todo-list">
      {todos.map((t) => (
        <div key={t.id} className={t.done ? 'todo-item done' : 'todo-item'}>
          <div
            className={t.done ? 'todo-check checked' : 'todo-check'}
            onClick={() => onToggle(t.id)}
          />
          <div className="todo-main">
            <p className="todo-text">{t.text}</p>
            <div className="todo-meta">
              <span className={`tag ${t.tag}`}>{t.tagLabel}</span>
              <span className="todo-sys">{t.sys}</span>
              <span className={t.today ? 'todo-due today' : 'todo-due'}>{t.due}</span>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}

type TodoPanelProps = {
  todos: Todo[]
  onToggle: (id: number) => void
  onExpand: () => void
}

export default function TodoPanel({ todos, onToggle, onExpand }: TodoPanelProps) {
  const open = todos.filter((t) => !t.done).length
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
        <TodoList todos={todos} onToggle={onToggle} />
      </div>
    </section>
  )
}
