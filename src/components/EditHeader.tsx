import styles from './EditHeader.module.css'

// 修正画面のどちらを出しているか。editOverwrite：記録の上書き、editDayStart：1日のスタート（App の画面の名前と同じ）
export type EditTab = 'editOverwrite' | 'editDayStart'

// 修正画面の上の部分（docs/mockups/Edit.dc.html・EditDayStart.dc.html）。2つの修正画面で共通
// 「戻る」ボタン・見出し「修正」と、その下の「記録の上書き／1日のスタート」の切り替え
function EditHeader({
  activeTab,
  onBack,
  onSelectTab,
}: {
  activeTab: EditTab // 今出している側
  onBack: () => void // 「戻る」を押したときに呼ぶ関数（トップに戻る）
  onSelectTab: (tab: EditTab) => void // 切り替えを押したときに呼ぶ関数（押した側の画面に切り替える）
}) {
  return (
    <>
      {/* ---------- 戻るボタンと見出し ---------- */}
      <header className={styles.header}>
        <button type="button" className={styles.backButton} aria-label="戻る" onClick={onBack}>
          <svg
            width="22"
            height="22"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M15 18l-6-6 6-6" />
          </svg>
        </button>
        <h1 className={styles.title}>修正</h1>
      </header>

      {/* ---------- 記録の上書き／1日のスタートの切り替え（選んでいる側は白地・太字） ---------- */}
      <nav className={styles.tabs} aria-label="修正の種類">
        <TabButton label="記録の上書き" isActive={activeTab === 'editOverwrite'} onPress={() => onSelectTab('editOverwrite')} />
        <TabButton label="1日のスタート" isActive={activeTab === 'editDayStart'} onPress={() => onSelectTab('editDayStart')} />
      </nav>
    </>
  )
}

// 切り替えのボタン1つ分。aria-current="page" で、今出している側だと読み上げに伝える
function TabButton({ label, isActive, onPress }: { label: string; isActive: boolean; onPress: () => void }) {
  return (
    <button
      type="button"
      className={isActive ? `${styles.tab} ${styles.activeTab}` : styles.tab}
      aria-current={isActive ? 'page' : undefined}
      onClick={onPress}
    >
      {label}
    </button>
  )
}

export default EditHeader
