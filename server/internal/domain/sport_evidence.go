package domain

import "time"

// SportRuleVersion 是运动成就规则版本；写入证据与审计，不参与幂等键
// （规格 ACH-02：版本升级不得复用旧键重复发放）。
const SportRuleVersion = "sport-v1"

// GrantStatus 是成就发放状态机。
type GrantStatus string

const (
	GrantLocked      GrantStatus = "locked"
	GrantUnlocked    GrantStatus = "unlocked"
	GrantGranting    GrantStatus = "granting"
	GrantGranted     GrantStatus = "granted"
	GrantGrantFailed GrantStatus = "grant_failed"
)

// MaxGrantAttempts 是补偿上限：首次 + 失败后最多 3 次补偿。
const MaxGrantAttempts = 3

// AchievementEvidence 是成就的权威状态；evidenceDays 永久保留（ACH-06）。
type AchievementEvidence struct {
	AchievementID string      `json:"achievementId"`
	RuleVersion   string      `json:"ruleVersion"`
	Status        GrantStatus `json:"status"`
	Progress      int         `json:"progress"`
	Need          int         `json:"need"`
	EvidenceDays  []string    `json:"evidenceDays,omitempty"`
	UnlockedAt    *time.Time  `json:"unlockedAt,omitempty"`
	RevokedAt     *time.Time  `json:"revokedAt,omitempty"`
	GrantedPoints int         `json:"grantedPoints"`
	Capped        bool        `json:"capped,omitempty"`
	GrantEntryID  string      `json:"grantEntryId,omitempty"`
	Attempts      int         `json:"attempts,omitempty"`
	LastErrorCode string      `json:"lastErrorCode,omitempty"`
	UpdatedAt     time.Time   `json:"updatedAt"`
}

// SportTombstone 记录已删除的运动记录，供同步下行与幂等删除。
type SportTombstone struct {
	Entity      string    `json:"entity"`
	BusinessKey string    `json:"businessKey"`
	DeletedAt   time.Time `json:"deletedAt"`
	Seq         int64     `json:"seq"`
}

const TombstoneEntitySportRecord = "sport_record"

// AchievementGrantKey 是成就积分入账的幂等键：sport:{userId}:{achievementId}:unlock。
func AchievementGrantKey(userID, achievementID string) string {
	return "sport:" + userID + ":" + achievementID + ":unlock"
}

// EvidenceViewStatus 将内部状态映射为对外四态（ACH-08）。
func EvidenceViewStatus(status GrantStatus) string {
	switch status {
	case GrantGranted:
		return "granted"
	case GrantGranting, GrantGrantFailed:
		return "granting"
	case GrantUnlocked:
		return "unlocked"
	default:
		return "locked"
	}
}