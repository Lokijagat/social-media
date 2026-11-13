import { useQuery } from '@tanstack/react-query'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getHealth } from '@/lib/api'

export function DashboardPage() {
  const health = useQuery({ queryKey: ['health'], queryFn: getHealth })

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Overview</h1>
      <Card className="max-w-md">
        <CardHeader>
          <CardTitle>System status</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-2 text-sm">
          <div className="flex items-center justify-between">
            <span>API server</span>
            {health.isLoading ? (
              <Badge variant="secondary">checking…</Badge>
            ) : health.isError ? (
              <Badge variant="destructive">offline</Badge>
            ) : (
              <Badge>online</Badge>
            )}
          </div>
          <div className="flex items-center justify-between">
            <span>MongoDB</span>
            <Badge variant={health.data?.db === 'connected' ? 'default' : 'secondary'}>
              {health.data?.db ?? '—'}
            </Badge>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
