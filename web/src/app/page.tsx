import { PageTitle, Panel, Sticky } from '@/components/ui'

export default function Home() {
  return (
    <>
      <PageTitle title="Needs review" kicker="Tuesday morning huddle" />
      <Panel title="Design system check">
        <Sticky>Queue arrives in the next commit.</Sticky>
      </Panel>
    </>
  )
}
