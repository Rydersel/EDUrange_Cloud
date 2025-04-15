import React from 'react'
import { Switch } from "@/components/ui/switch"

interface HideCompletedToggleProps {
  hideCompleted: boolean
  setHideCompleted: (hide: boolean) => void
}

export function HideCompletedToggle({ hideCompleted, setHideCompleted }: HideCompletedToggleProps) {
  return (
    <div className="flex justify-end mb-6">
      <div className="flex items-center space-x-2">
        <Switch
          id="hide-completed"
          checked={hideCompleted}
          onCheckedChange={setHideCompleted}
        />
        <label htmlFor="hide-completed" className="text-sm text-gray-400">
          Hide Completed
        </label>
      </div>
    </div>
  )
}

