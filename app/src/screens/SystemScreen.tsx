import React, { useEffect, useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ApiClient, NetworkError } from '../api/client';
import { SystemApi, type HealthResponse } from '../api/systemApi';
import { APP_ENV, APP_VERSION, clientAllowInsecure, clientBaseUrl } from '../shared/config';
import {
  AppButton,
  HeaderBar,
  IconBadge,
  PageScroll,
  Pill,
  SectionHeader,
  Surface,
  UIText
} from '../ui/primitives';
import { palette, radius, featurePalette } from '../ui/theme';

type StatusTone = 'ok' | 'warn' | 'fail' | 'off';

function statusOf(value: string | undefined): { label: string; tone: StatusTone } {
  if (!value || value === 'not_configured') return { label: '未配置', tone: 'off' };
  if (value === 'ok') return { label: '正常', tone: 'ok' };
  if (value === 'degraded' || value === 'unknown') return { label: '降级', tone: 'warn' };
  return { label: '异常', tone: 'fail' };
}

const toneColor: Record<StatusTone, string> = {
  ok: palette.success,
  warn: palette.warning,
  fail: palette.danger,
  off: palette.muted
};

const CLOSED_LOOP = [
  { step: '01', title: '需求理解', desc: '把赛题拆成可验收的登录、清单与云资源需求' },
  { step: '02', title: '代码生成', desc: 'CodeArts 生成 React Native 页面与 Go 四层骨架' },
  { step: '03', title: '项目构建', desc: '类型检查、单元测试、Webpack 产物与 Go 编译' },
  { step: '04', title: '问题修复', desc: '按 traceId 与测试失败点回填代码' },
  { step: '05', title: '部署上线', desc: 'ECS + Docker Compose + RDS / Redis，Nginx 反代' }
];

export function SystemScreen({ onBack, isGuest }: { onBack: () => void; isGuest: boolean }): React.JSX.Element {
  const api = useMemo(
    () => new SystemApi(new ApiClient({ baseUrl: clientBaseUrl(), allowInsecure: clientAllowInsecure() })),
    []
  );
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(!isGuest);
  const [error, setError] = useState<string | null>(null);

  const load = (): void => {
    if (isGuest) {
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    void api
      .health()
      .then(({ data }) => setHealth(data))
      .catch((err) => {
        setHealth(null);
        setError(err instanceof NetworkError ? '服务端不可达，当前展示静态架构' : '健康检查失败，当前展示静态架构');
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGuest]);

  const checks = health?.checks;
  const apiStatus = health ? { label: '正常', tone: 'ok' as StatusTone } : error ? { label: '离线', tone: 'fail' as StatusTone } : { label: loading ? '检测中' : '未连接', tone: 'off' as StatusTone };

  return (
    <View style={styles.root}>
      <HeaderBar title="系统与云端" subtitle="Track 1 · 云上部署演示" onBack={onBack} />
      <PageScroll>
        <Surface padding={0} radiusValue={radius.xl} style={{ overflow: 'hidden', backgroundColor: palette.night }}>
          <View style={styles.glow} />
          <View style={{ padding: 18 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Pill label="HUAWEI CLOUD" accent={palette.white} tone="outline" style={{ borderColor: 'rgba(255,255,255,0.24)' }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <View style={[styles.dot, { backgroundColor: health ? palette.success : palette.warning }]} />
                <UIText variant="caption" color="rgba(255,255,255,0.62)">
                  {health ? '服务运行中' : isGuest ? '本地游客模式' : '检测中'}
                </UIText>
              </View>
            </View>
            <UIText variant="h1" color={palette.white} style={{ marginTop: 14 }}>
              从想法到云上应用
            </UIText>
            <UIText variant="small" color="rgba(255,255,255,0.62)" style={{ marginTop: 6, lineHeight: 19 }}>
              华为云码道 CodeArts 代码智能体 + RDS / Redis + ECS 部署。页面只展示公开的运行状态，不包含任何密钥。
            </UIText>
            <View style={{ flexDirection: 'row', gap: 8, marginTop: 16 }}>
              <Pill label={`v${APP_VERSION}`} accent={palette.white} tone="outline" style={{ borderColor: 'rgba(255,255,255,0.18)' }} />
              <Pill label={APP_ENV} accent={palette.white} tone="outline" style={{ borderColor: 'rgba(255,255,255,0.18)' }} />
              <Pill label={health?.cloud?.region ?? 'cn-north-4'} accent={palette.white} tone="outline" style={{ borderColor: 'rgba(255,255,255,0.18)' }} />
            </View>
          </View>
        </Surface>

        {error ? (
          <Surface tone="soft" style={{ marginTop: 12, backgroundColor: palette.warningTint, borderColor: `${palette.warning}26` }}>
            <UIText variant="small" color={palette.warning}>
              {error}
            </UIText>
          </Surface>
        ) : null}

        <SectionHeader
          title="云端架构"
          caption="客户端 → Go API → 托管数据服务"
          actionLabel={loading ? '检测中…' : '刷新'}
          onAction={load}
          style={{ marginTop: 22 }}
        />
        <Surface>
          <View style={styles.archRow}>
            <ArchNode icon="📱" title="客户端" sub="React Native" accent={palette.brand} />
            <TextArrow />
            <ArchNode icon="⚙️" title="authd" sub="Go 四层架构" accent={palette.ink} />
          </View>
          <View style={styles.archDown}>
            <View style={styles.archLine} />
            <UIText variant="caption" tone="faint" style={{ fontSize: 9 }}>
              VPC 内网
            </UIText>
            <View style={styles.archLine} />
          </View>
          <View style={styles.archRow}>
            <ArchNode icon="🗄️" title="RDS MySQL" sub="用户 / 会话 / 审计" accent={featurePalette.water.main} />
            <ArchNode icon="⚡" title="DCS Redis" sub="缓存 / 限流" accent={palette.warning} />
            <ArchNode icon="🤖" title="MaaS" sub="可选模型能力" accent={featurePalette.english.main} />
          </View>
          <View style={styles.archHint}>
            <UIText variant="caption" tone="faint" style={{ textAlign: 'center', lineHeight: 16 }}>
              RDS 与 Redis 通过 VPC 内网访问；MaaS 作为可选的模型能力，不参与主链路鉴权。
            </UIText>
          </View>
        </Surface>

        <SectionHeader title="运行状态" caption="来自 /v1/health 的公开检查项" style={{ marginTop: 22 }} />
        <Surface padding={4}>
          <StatusRow icon="🌐" label="API 服务" status={apiStatus} detail={health ? `${health.version} · ${health.env}` : '--'} last={false} />
          <StatusRow icon="🗄️" label="RDS 数据库" status={statusOf(checks?.rds)} detail={checks?.rds ?? '等待服务端探测'} />
          <StatusRow icon="⚡" label="DCS Redis" status={statusOf(checks?.redis)} detail={checks?.redis ?? '等待服务端探测'} />
          <StatusRow icon="🪪" label="华为账号服务" status={statusOf(checks?.huawei)} detail={checks?.huawei ?? '等待服务端探测'} />
          <StatusRow icon="🤖" label="MaaS 模型" status={statusOf(checks?.maas)} detail={checks?.maas ?? '可选能力'} last />
        </Surface>

        <SectionHeader title="CodeArts 开发闭环" caption="赛题一要求的五个环节" style={{ marginTop: 22 }} />
        <View style={{ gap: 8 }}>
          {CLOSED_LOOP.map((item) => (
            <Surface key={item.step} tone="soft" style={{ flexDirection: 'row', alignItems: 'center', gap: 11 }}>
              <View style={styles.stepBadge}>
                <UIText variant="caption" color={palette.brand} style={{ fontWeight: '800' }}>
                  {item.step}
                </UIText>
              </View>
              <View style={{ flex: 1 }}>
                <UIText variant="bodyStrong" style={{ fontSize: 13 }}>
                  {item.title}
                </UIText>
                <UIText variant="caption" tone="muted" style={{ marginTop: 2, lineHeight: 16 }}>
                  {item.desc}
                </UIText>
              </View>
            </Surface>
          ))}
        </View>

        <SectionHeader title="演示路径" caption="评委可在 3 分钟内走完" style={{ marginTop: 22 }} />
        <Surface tone="soft">
          <DemoStep index="01" title="游客进入" desc="打开 ?demo=guest，直接进入清单主页" />
          <DemoStep index="02" title="记录与洞察" desc="记录一杯水、切换清单、查看统计与成就" />
          <DemoStep index="03" title="系统与云端" desc="打开本页，查看 RDS / Redis / API 运行状态" last />
        </Surface>

        <Surface tone="soft" style={{ marginTop: 14 }}>
          <UIText variant="caption" tone="faint" style={{ lineHeight: 18 }}>
            {isGuest
              ? '游客模式不会发起网络请求；上方状态为静态架构说明。登录后可查看真实健康检查结果。'
              : '健康检查只返回 ok / degraded / fail / not_configured，不返回连接串、账号或密钥。'}
          </UIText>
        </Surface>

        <AppButton label="返回我的" variant="secondary" fullWidth onPress={onBack} style={{ marginTop: 16 }} />
      </PageScroll>
    </View>
  );
}

function ArchNode({
  icon,
  title,
  sub,
  accent
}: {
  icon: string;
  title: string;
  sub: string;
  accent: string;
}): React.JSX.Element {
  return (
    <View style={styles.node}>
      <IconBadge icon={icon} accent={accent} size={30} />
      <View style={{ width: '100%', minWidth: 0 }}>
        <UIText variant="bodyStrong" numberOfLines={1} style={{ fontSize: 11 }}>
          {title}
        </UIText>
        <UIText variant="caption" tone="faint" numberOfLines={2} style={{ fontSize: 9, marginTop: 1, lineHeight: 12 }}>
          {sub}
        </UIText>
      </View>
    </View>
  );
}

function TextArrow(): React.JSX.Element {
  return (
    <UIText variant="caption" tone="faint" style={{ fontSize: 16, marginTop: -2 }}>
      →
    </UIText>
  );
}

function StatusRow({
  icon,
  label,
  status,
  detail,
  last = false
}: {
  icon: string;
  label: string;
  status: { label: string; tone: StatusTone };
  detail: string;
  last?: boolean;
}): React.JSX.Element {
  const color = toneColor[status.tone];
  return (
    <View style={[styles.statusRow, !last && styles.statusBorder]}>
      <IconBadge icon={icon} accent={color} size={30} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <UIText variant="bodyStrong" style={{ fontSize: 13 }}>
          {label}
        </UIText>
        <UIText variant="caption" tone="faint" numberOfLines={1} style={{ marginTop: 1 }}>
          {detail}
        </UIText>
      </View>
      <View style={[styles.statusPill, { backgroundColor: `${color}14` }]}>
        <View style={[styles.dot, { backgroundColor: color }]} />
        <UIText variant="caption" color={color} style={{ fontWeight: '700' }}>
          {status.label}
        </UIText>
      </View>
    </View>
  );
}

function DemoStep({
  index,
  title,
  desc,
  last = false
}: {
  index: string;
  title: string;
  desc: string;
  last?: boolean;
}): React.JSX.Element {
  return (
    <View style={[styles.demoStep, !last && styles.statusBorder]}>
      <UIText variant="label" color={palette.brand} style={{ width: 24 }}>
        {index}
      </UIText>
      <View style={{ flex: 1 }}>
        <UIText variant="bodyStrong" style={{ fontSize: 13 }}>
          {title}
        </UIText>
        <UIText variant="caption" tone="muted" style={{ marginTop: 2 }}>
          {desc}
        </UIText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.canvas },
  glow: {
    position: 'absolute',
    width: 280,
    height: 280,
    borderRadius: 140,
    backgroundColor: palette.brand,
    opacity: 0.2,
    top: -150,
    right: -80
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  archRow: { flexDirection: 'row', alignItems: 'stretch', gap: 5 },
  archDown: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 4 },
  archLine: { flex: 1, height: 1, backgroundColor: palette.line },
  node: {
    flex: 1,
    minWidth: 0,
    borderWidth: 1,
    borderColor: palette.line,
    backgroundColor: palette.surfaceAlt,
    borderRadius: radius.sm,
    padding: 8,
    alignItems: 'flex-start',
    gap: 6
  },
  archHint: { marginTop: 10, borderTopWidth: 1, borderTopColor: palette.line, paddingTop: 9 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 10, paddingHorizontal: 8 },
  statusBorder: { borderBottomWidth: 1, borderBottomColor: palette.line },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, borderRadius: radius.pill, paddingHorizontal: 9, paddingVertical: 4 },
  stepBadge: {
    width: 34,
    height: 34,
    borderRadius: 12,
    backgroundColor: palette.brandTint,
    alignItems: 'center',
    justifyContent: 'center'
  },
  demoStep: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingVertical: 9 }
});
