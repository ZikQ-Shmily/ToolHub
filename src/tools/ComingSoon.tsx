import React from 'react'
import { Wrench } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function ComingSoon() {
  return (
    <div className="flex flex-col items-start gap-3">
      <div className="text-sm text-muted-foreground">
        这个小工具正在开发中，稍后会上线。你可以先使用上方的其他工具。
      </div>
      <Button variant="secondary" className="gap-2" disabled>
        <Wrench className="h-4 w-4" /> 敬请期待
      </Button>
    </div>
  )
}
