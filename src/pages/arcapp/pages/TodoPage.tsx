import { useOutletContext } from 'react-router-dom'
import type { ShellContext } from '../ShellContext'
import { TodoList } from '../components/TodoPanel'

export default function TodoPage() {
  const { todos, onToggleTodo } = useOutletContext<ShellContext>()
  const open = todos.filter((t) => !t.done).length

  return (
    <section className="panel" id="todo">
      <div className="panel-header">
        <div className="panel-header-left">
          <h2 className="panel-title">Your To-Dos</h2>
          <span className="panel-count">{open} open</span>
        </div>
      </div>
      <div className="panel-body">
        <TodoList todos={todos} onToggle={onToggleTodo} />
      </div>
    </section>
  )
}
