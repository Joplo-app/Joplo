import json, os, copy
OUT = os.path.dirname(os.path.abspath(__file__))
F = "feat_focus"

def N(id, type, children=None, **props):
    n = {"id": id, "type": type}
    extra = {k: props.pop(k) for k in ["when", "disabled", "disabledReason", "unmodeled", "note"] if k in props}
    if props: n["props"] = props
    if children: n["children"] = children
    n.update(extra)
    return n

def btn(id, label, variant="secondary", **kw): return N(id, "Button", label=label, variant=variant, **kw)
def link(id, label, **kw): return N(id, "Link", label=label, **kw)
def text(id, t, tone="default", **kw): return N(id, "Text", text=t, tone=tone, **kw)
def row(id, ch, **kw): return N(id, "Stack", ch, direction="row", gap=kw.pop("gap", 10), align=kw.pop("align", "center"), **kw)
def col(id, ch, **kw): return N(id, "Stack", ch, direction="col", gap=kw.pop("gap", 10), **kw)
def step(id, kind, action, caption, effects=(), rules=()):
    return {"id": id, "kind": kind, "action": action, "caption": caption, "effects": list(effects), "ruleIds": list(rules)}
def click(t): return {"type": "click", "target": t}
def event(n): return {"type": "event", "name": n}
def setv(p, v): return {"type": "set", "path": p, "value": v}
def toast(t, tone="info"): return {"type": "toast", "text": t, "tone": tone}
def done(t, o="success"): return {"type": "complete", "text": t, "outcome": o}

def stage(p, extra=()):
    """被演示的原型（邀请成员页的缩略），在各方案中都是同一份内容，只是位置和周边不同。"""
    return N(f"{p}_stage", "Card", [
        row(f"{p}_stage_hdr", [N(f"{p}_stage_title", "Heading", text="成员", level=2),
                               row(f"{p}_stage_actions", [*extra, btn(f"{p}_stage_invite", "邀请成员", "primary", note="被演示原型里的业务按钮；审阅模式下点击是“选中”，演示模式下是“执行”")], gap=6)], justify="between"),
        N(f"{p}_stage_tbl", "Table", columns=[{"key": "n", "label": "姓名"}, {"key": "e", "label": "邮箱"}, {"key": "r", "label": "权限"}],
          rows=[{"n": "王芳", "e": "wang.fang@example.com", "r": "管理员"}, {"n": "陈晨", "e": "chen.chen@example.com", "r": "编辑者"}]),
        text(f"{p}_stage_hint", "（这一块就是被演示的原型，默认应占工作区的大部分宽度）", "muted"),
    ], title="原型舞台 · 成员管理页")

def stepbar(p, when=None):
    kw = {"when": when} if when else {}
    return row(f"{p}_stepbar", [
        btn(f"{p}_btn_play", "▶ 自动播放", "primary"),
        btn(f"{p}_btn_next", "下一步", unmodeled=True),
        text(f"{p}_caption", "$ui.caption", "muted"),
    ], **kw)

def header(p, extra):
    return N(f"{p}_hdr", "Header", [N(f"{p}_badge_concept", "Badge", text="概念原型 · 非正式实现", tone="warning"),
                                     N(f"{p}_badge_mode", "Badge", text="$ui.modeText"), *extra],
             title="Joplo · 团队邀请功能 / A · 单人邮件邀请弹窗")

case_links = lambda p, first_id: [
    link(first_id, "缺失 · 邮箱无效"),
    link(f"{p}_case_revoked", "缺失 · 撤销后打开", unmodeled=True),
    link(f"{p}_case_expired", "缺失 · 过期后访问", unmodeled=True),
    link(f"{p}_case_member", "待决定 · 已是成员", unmodeled=True),
    link(f"{p}_case_happy", "已表达 · 正常邀请", unmodeled=True),
]
inspector_body = lambda p: [
    text(f"{p}_ins_type", "按钮「邀请成员」"),
    text(f"{p}_ins_ref", "引用：btn_invite", "muted"),
    N(f"{p}_ins_rule1", "Badge", text="用户 · 已确认", tone="success"),
    text(f"{p}_ins_rule1_t", "只有空间管理员可以发起邀请"),
    N(f"{p}_ins_rule2", "Badge", text="AI 假设 · 待确认", tone="warning"),
    text(f"{p}_ins_rule2_t", "发送中禁用按钮，防止重复提交"),
]
init_ui = lambda **kw: {"modeText": "当前：演示模式", "caption": "第 0 / 5 步 · 准备开始", **kw}

def base_patch(rev, key, summary, ops): return {"expectRevision": rev, "idempotencyKey": key, "summary": summary, "operations": ops}

cases = [
    ("case_first_look", "第一次打开方案，先看懂原型", "main", "原型占据画面主体，不用滚动就能看到完整页面；其他信息不抢注意力", "high"),
    ("case_find_gap", "找出还没设计的情况", "main", "缺失和待决定的数量常驻可见，最多一次点击就能看到清单并定位", "high"),
    ("case_point", "选中一个元素，告诉 Agent 改什么", "main", "选中后能看到元素引用和关联规则，并同步给 Agent（D15）", "high"),
    ("case_rule_of_step", "看某个元素或步骤背后的规则", "consistency", "能分辨规则是用户确认的还是 AI 假设", "high"),
    ("case_meeting", "会议上共享屏幕演示", "main", "旁听者只看到原型和步骤字幕，不被内部信息分散注意力（D8）", "medium"),
    ("case_small_window", "在笔记本小窗口里使用", "input", "1280 宽的窗口里原型仍清晰可读", "medium"),
]
p1 = base_patch(0, "self_feature_v1", "建立 Joplo 自迭代功能：方案工作区减负", [
    {"op": "upsertFeature", "value": {"id": F, "name": "方案工作区减负：让原型成为主角", "goal": "打开一个方案时，被演示的原型占据画面主体；场景、情况、规则和检查器按需出现，但可追溯性不能丢",
        "roles": ["驱动 Agent 的开发者（审阅者本人）", "会议旁听者"],
        "constraints": [
            {"id": "con_trace", "text": "从任一元素，一步之内仍能看到它关联的规则与情况（PRD 1.2）", "hard": True},
            {"id": "con_mode", "text": "审阅 / 演示模式始终清楚可辨（PRD 4.4）", "hard": True},
            {"id": "con_concept", "text": "“概念原型 · 非正式实现”标识常驻", "hard": True},
            {"id": "con_gaps", "text": "缺失与待决定的情况不能被藏到无法发现（PRD 6.2）", "hard": True}],
        "caseIds": [c[0] for c in cases], "optionIds": [], "dependsOn": []}},
    *[{"op": "upsertCase", "value": {"id": c[0], "featureId": F, "title": c[1], "dimension": c[2], "expected": c[3], "priority": c[4]}} for c in cases],
    {"op": "upsertRule", "value": {"id": "rule_less_by_default", "featureId": F, "text": "默认界面的信息要少，原型是主角（用户反馈：“看着东西太多了”）", "origin": "feedback", "confirmation": "pending", "caseIds": ["case_first_look", "case_meeting"]}},
    {"op": "upsertRule", "value": {"id": "rule_stage_70", "featureId": F, "text": "默认状态下，原型舞台宽度不少于工作区宽度的 70%", "origin": "ai_assumption", "confirmation": "pending", "caseIds": ["case_first_look", "case_small_window"]}},
    {"op": "upsertRule", "value": {"id": "rule_gaps_visible", "featureId": F, "text": "缺失与待决定的情况数量始终可见，不能只藏在收起的面板里", "origin": "project_material", "confirmation": "pending", "caseIds": ["case_find_gap"]}},
    {"op": "upsertRule", "value": {"id": "rule_trace_one_step", "featureId": F, "text": "从原型中的元素出发，一步就能看到关联规则与情况", "origin": "project_material", "confirmation": "pending", "caseIds": ["case_point", "case_rule_of_step"]}},
])

def option_patch(rev, oid, name, idea, focus, tradeoffs, scene, scenarios, coverage, rules, opt_ids, issues=()):
    ops = [{"op": "upsertOption", "value": {"id": oid, "featureId": F, "name": name, "idea": idea, "decisionFocus": focus, "tradeoffs": tradeoffs, "coverage": {}}},
           {"op": "upsertFeature", "value": {**copy.deepcopy(p1["operations"][0]["value"]), "optionIds": opt_ids}},
           {"op": "upsertScene", "value": scene}]
    ops += [{"op": "upsertRule", "value": r} for r in rules]
    ops += [{"op": "upsertScenario", "value": s} for s in scenarios]
    ops += [{"op": "setCoverage", "optionId": oid, "caseId": c, "value": v} for c, v in coverage.items()]
    ops += [{"op": "upsertIssue", "value": i} for i in issues]
    return base_patch(rev, f"self_{oid}_v1", f"方案 {name}", ops)

def scen(id, oid, scene_id, name, desc, cases, label, ui, steps, expected):
    return {"id": id, "optionId": oid, "name": name, "description": desc, "caseIds": cases, "mock": {"label": label, "outcome": "success"},
            "initial": {"sceneId": scene_id, "ui": ui, "data": {}, "inputs": {}}, "steps": steps, "expected": expected}

# ---------------- 方案 A：保留三栏，默认收起 ----------------
A, SA = "opt_fold", "scene_fold"
sceneA = {"id": SA, "optionId": A, "name": "A · 工作区（侧栏默认收起）", "kind": "proposed", "viewport": "desktop", "root": N("fa_page", "Page", [
    header("fa", [btn("fa_btn_review", "切到审阅")]),
    row("fa_toolbar", [
        row("fa_tb_left", [btn("fa_btn_scenes", "☰ 场景 · 3", unmodeled=True), btn("fa_btn_cases", "情况 · 缺失 3 · 待决定 1", note="收起状态下仍常驻缺口数量（rule_gaps_visible）")]),
        btn("fa_btn_rules", "规则 · 5 ▸", unmodeled=True)], justify="between"),
    row("fa_body", [
        N("fa_left", "Sidebar", [*case_links("fa", "fa_case_gap"), btn("fa_btn_fold_left", "◂ 收起", "ghost", unmodeled=True)], title="情况覆盖（8）", when={"truthy": "ui.leftOpen"}),
        stage("fa"),
        N("fa_right", "Sidebar", inspector_body("fa"), title="检查器", when={"truthy": "ui.rightOpen"}),
    ], align="stretch", gap=12),
    stepbar("fa"),
])}
scA = [
    scen("sc_fa_first", A, SA, "第一次打开，然后自动播放", "默认两侧都收起，原型占满宽度", ["case_first_look", "case_meeting"], "模拟演示",
         init_ui(), [
            step("fa1_play", "user", click("fa_btn_play"), "点「自动播放」：原型开始演示，两侧栏保持收起", [setv("ui.caption", "第 1 / 5 步 · 管理员点击「邀请成员」，打开邀请弹窗")], ["rule_less_by_default"]),
            step("fa1_sys", "system", event("自动播放进行中（模拟）"), "演示持续推进；旁听者只看到原型和字幕", [setv("ui.caption", "第 5 / 5 步 · 系统返回成功，出现 Toast"), done("看完主流程，界面上没有多余信息")])],
         "两侧收起，原型宽度接近整个工作区"),
    scen("sc_fa_gap", A, SA, "找出还没设计的情况", "从工具条上的缺口数量展开情况清单", ["case_find_gap"], "模拟查找缺口",
         init_ui(), [
            step("fa2_open", "user", click("fa_btn_cases"), "点工具条上的「情况 · 缺失 3 · 待决定 1」，左侧展开情况清单（原型被挤窄）", [setv("ui.leftOpen", True)], ["rule_gaps_visible"]),
            step("fa2_pick", "user", click("fa_case_gap"), "点「缺失 · 邮箱为空或格式无效」定位到缺口", [toast("方案 A 还没有这个情况的场景，可以让 Agent 补上"), done("找到缺口，用了两次点击")])],
         "缺口一直可见；展开后原型变窄"),
    scen("sc_fa_point", A, SA, "选中元素并同步给 Agent", "切到审阅模式后点原型中的按钮，右侧展开检查器", ["case_point", "case_rule_of_step"], "模拟审阅",
         init_ui(), [
            step("fa3_review", "user", click("fa_btn_review"), "点「切到审阅」：点击原型只会选中，不会执行", [setv("ui.modeText", "当前：审阅模式")]),
            step("fa3_pick", "user", click("fa_stage_invite"), "点原型里的「邀请成员」：右侧展开检查器，显示引用与规则", [setv("ui.rightOpen", True), toast("已选中 btn_invite，可在 Agent 会话里说要改什么"), done("一步看到规则，并已同步给 Agent")], ["rule_trace_one_step"])],
         "检查器只在选中时出现"),
]
covA = {"case_first_look": {"status": "expressed", "scenarioIds": ["sc_fa_first"]},
        "case_find_gap": {"status": "expressed", "scenarioIds": ["sc_fa_gap"]},
        "case_point": {"status": "expressed", "scenarioIds": ["sc_fa_point"]},
        "case_rule_of_step": {"status": "expressed", "scenarioIds": ["sc_fa_point"], "reason": "需要先选中元素；演示过程中看不到当前步骤的规则"},
        "case_meeting": {"status": "expressed", "scenarioIds": ["sc_fa_first"]},
        "case_small_window": {"status": "undecided", "reason": "两侧同时展开时，小窗口里的原型仍会被挤到一半宽度；改成浮层还是挤压，待决定"}}
rulesA = [{"id": "rule_fa_remember", "featureId": F, "optionId": A, "text": "侧栏的展开 / 收起状态按项目记住", "origin": "ai_assumption", "confirmation": "pending", "caseIds": ["case_first_look"], "elementRefs": [f"{SA}#fa_btn_cases"]}]
issA = [{"id": "iss_fa_overlay", "featureId": F, "optionId": A, "text": "侧栏展开时是挤压原型，还是以浮层盖在原型上？", "severity": "major", "source": "ai", "refs": ["case_small_window"]}]

# ---------------- 方案 B：模式决定信息量 ----------------
B, SB = "opt_mode", "scene_mode"
sceneB = {"id": SB, "optionId": B, "name": "B · 工作区（演示纯净 / 审阅完整）", "kind": "proposed", "viewport": "desktop", "root": N("mb_page", "Page", [
    header("mb", [btn("mb_btn_gaps", "缺失 3 · 待决定 1", "ghost", note="演示模式下唯一常驻的设计信息"), btn("mb_btn_mode", "$ui.modeBtn")]),
    row("mb_body", [
        N("mb_left", "Sidebar", [*case_links("mb", "mb_case_gap")], title="情况覆盖（8）", when={"eq": ["ui.mode", "review"]}),
        stage("mb"),
        N("mb_right", "Sidebar", [text("mb_ins_empty", "点击原型中的元素查看规则", "muted", when={"falsy": "ui.selected"}),
                                  col("mb_ins", inspector_body("mb"), when={"truthy": "ui.selected"})], title="检查器", when={"eq": ["ui.mode", "review"]}),
    ], align="stretch", gap=12),
    stepbar("mb", when={"eq": ["ui.mode", "demo"]}),
    N("mb_review_hint", "Alert", text="审阅模式：点击原型元素只会选中，并同步给 Agent；回到演示模式时侧栏自动隐藏", tone="info", when={"eq": ["ui.mode", "review"]}),
])}
uiB = lambda: init_ui(mode="demo", modeBtn="切到审阅", selected=False)
toReview = [setv("ui.mode", "review"), setv("ui.modeBtn", "切到演示"), setv("ui.modeText", "当前：审阅模式")]
scB = [
    scen("sc_mb_first", B, SB, "第一次打开，然后自动播放", "演示模式只有原型、步骤条和缺口数量", ["case_first_look", "case_meeting"], "模拟演示", uiB(), [
        step("mb1_play", "user", click("mb_btn_play"), "点「自动播放」：画面上只有原型和字幕", [setv("ui.caption", "第 1 / 5 步 · 管理员点击「邀请成员」，打开邀请弹窗")], ["rule_less_by_default"]),
        step("mb1_sys", "system", event("自动播放进行中（模拟）"), "演示持续推进；适合会议共享屏幕", [setv("ui.caption", "第 5 / 5 步 · 系统返回成功，出现 Toast"), done("会议演示时画面最干净")])],
        "演示模式下没有侧栏"),
    scen("sc_mb_gap", B, SB, "找出还没设计的情况", "点顶栏的缺口数量，直接进入审阅模式并打开情况清单", ["case_find_gap"], "模拟查找缺口", uiB(), [
        step("mb2_open", "user", click("mb_btn_gaps"), "点顶栏「缺失 3 · 待决定 1」：切到审阅模式，两侧栏同时出现", toReview, ["rule_gaps_visible"]),
        step("mb2_pick", "user", click("mb_case_gap"), "点「缺失 · 邮箱为空或格式无效」定位到缺口", [toast("方案 A 还没有这个情况的场景，可以让 Agent 补上"), done("找到缺口；但整个界面随之切换成三栏")])],
        "进入审阅后布局整体变化"),
    scen("sc_mb_point", B, SB, "选中元素并同步给 Agent", "审阅模式下点原型按钮，检查器显示规则", ["case_point", "case_rule_of_step"], "模拟审阅", uiB(), [
        step("mb3_review", "user", click("mb_btn_mode"), "点「切到审阅」：两侧栏出现，原型变窄", toReview),
        step("mb3_pick", "user", click("mb_stage_invite"), "点原型里的「邀请成员」：检查器显示引用与规则", [setv("ui.selected", True), toast("已选中 btn_invite，可在 Agent 会话里说要改什么"), done("一步看到规则，并已同步给 Agent")], ["rule_trace_one_step"])],
        "审阅模式信息完整"),
]
covB = {"case_first_look": {"status": "expressed", "scenarioIds": ["sc_mb_first"]},
        "case_find_gap": {"status": "expressed", "scenarioIds": ["sc_mb_gap"]},
        "case_point": {"status": "expressed", "scenarioIds": ["sc_mb_point"]},
        "case_rule_of_step": {"status": "expressed", "scenarioIds": ["sc_mb_point"], "reason": "只有在审阅模式下能看到；演示时看不到当前步骤的规则"},
        "case_meeting": {"status": "expressed", "scenarioIds": ["sc_mb_first"]},
        "case_small_window": {"status": "undecided", "reason": "演示模式没有问题；审阅模式仍是三栏，小窗口会回到现在的拥挤"}}
rulesB = [{"id": "rule_mb_mode_layout", "featureId": F, "optionId": B, "text": "侧栏是否显示完全由模式决定：演示模式隐藏，审阅模式显示", "origin": "ai_assumption", "confirmation": "pending", "caseIds": ["case_first_look", "case_meeting"], "elementRefs": [f"{SB}#mb_btn_mode"]}]
issB = [{"id": "iss_mb_jump", "featureId": F, "optionId": B, "text": "切换模式时整个布局跳动，会不会让人找不到刚才看的位置？", "severity": "minor", "source": "ai", "refs": ["case_point"]}]

# ---------------- 方案 C：标注贴在画面上，取消右栏 ----------------
C, SC = "opt_anno", "scene_anno"
sceneC = {"id": SC, "optionId": C, "name": "C · 工作区（规则就地标注，情况即场景）", "kind": "proposed", "viewport": "desktop", "root": N("an_page", "Page", [
    header("an", [btn("an_btn_hide_anno", "隐藏标注", unmodeled=True, note="会议时一键隐藏所有标注")]),
    row("an_body", [
        N("an_cases", "Sidebar", [
            link("an_case_happy", "▶ 正常发出邀请", unmodeled=True),
            link("an_case_denied", "▶ 非管理员尝试邀请", unmodeled=True),
            link("an_case_fail", "▶ 发送失败后重试", unmodeled=True),
            link("an_case_gap", "○ 缺失 · 邮箱无效"),
            link("an_case_revoked", "○ 缺失 · 撤销后打开", unmodeled=True),
            link("an_case_member", "◐ 待决定 · 已是成员", unmodeled=True)], title="情况（8）· 缺失 3", note="情况与场景合并成一列：点“▶”播放对应场景，点“○”查看缺口"),
        col("an_main", [
            N("an_stage_wrap", "Stack", [
                stage("an", [btn("an_anno_rule", "① 仅管理员可邀请", "ghost", note="规则标注贴在对应元素旁边")]),
            ], direction="col", when={"falsy": "ui.gapView"}),
            N("an_note", "Card", [text("an_note_t", "规则：只有空间管理员可以发起邀请"), N("an_note_badge", "Badge", text="用户 · 已确认", tone="success"),
                                  text("an_note_case", "关联情况：非管理员尝试邀请", "muted"), btn("an_btn_copy", "复制引用给 Agent")],
              title="① 规则详情", when={"truthy": "ui.noteOpen"}),
            N("an_gap_empty", "EmptyState", title="这个情况还没有设计", text="邮箱为空或格式无效 · 当前方案还没有对应场景", when={"truthy": "ui.gapView"}),
            btn("an_btn_ask", "选中这个缺口，让 Agent 补上", "primary", when={"truthy": "ui.gapView"}),
        ], gap=12),
    ], align="stretch", gap=12),
    stepbar("an"),
])}
uiC = lambda: init_ui(noteOpen=False, gapView=False)
scC = [
    scen("sc_an_first", C, SC, "第一次打开，然后自动播放", "只有左侧一列情况；规则以编号标注贴在原型上", ["case_first_look", "case_meeting", "case_small_window"], "模拟演示", uiC(), [
        step("an1_play", "user", click("an_btn_play"), "点「自动播放」：原型演示，标注留在对应元素旁边", [setv("ui.caption", "第 1 / 5 步 · 管理员点击「邀请成员」，打开邀请弹窗")], ["rule_less_by_default"]),
        step("an1_sys", "system", event("自动播放进行中（模拟）"), "演示持续推进；会议时可以一键隐藏标注", [setv("ui.caption", "第 5 / 5 步 · 系统返回成功，出现 Toast"), done("原型占主体；没有右栏")])],
        "只有一列侧栏"),
    scen("sc_an_rule", C, SC, "看按钮背后的规则", "点原型旁边的编号标注，就地看到规则并复制引用", ["case_rule_of_step", "case_point"], "模拟查看规则", uiC(), [
        step("an2_anno", "user", click("an_anno_rule"), "点原型旁的「① 仅管理员可邀请」，就地展开规则详情", [setv("ui.noteOpen", True)], ["rule_trace_one_step"]),
        step("an2_copy", "user", click("an_btn_copy"), "点「复制引用给 Agent」", [toast("已选中 scene_a_members#btn_invite，可在 Agent 会话里说要改什么"), done("不用切换模式，也不用打开右栏")])],
        "规则离画面最近"),
    scen("sc_an_gap", C, SC, "找出还没设计的情况", "情况列表常驻；点缺失项，舞台直接显示“还没有设计”", ["case_find_gap"], "模拟查找缺口", uiC(), [
        step("an3_pick", "user", click("an_case_gap"), "点左侧「○ 缺失 · 邮箱为空或格式无效」：舞台显示这个缺口", [setv("ui.gapView", True), setv("ui.noteOpen", False)], ["rule_gaps_visible"]),
        step("an3_ask", "user", click("an_btn_ask"), "点「选中这个缺口，让 Agent 补上」", [toast("已选中这个情况，可以在 Agent 会话里说「补上它」"), done("一次点击定位缺口")])],
        "缺口与场景在同一列表"),
]
covC = {"case_first_look": {"status": "expressed", "scenarioIds": ["sc_an_first"]},
        "case_find_gap": {"status": "expressed", "scenarioIds": ["sc_an_gap"]},
        "case_point": {"status": "expressed", "scenarioIds": ["sc_an_rule"], "reason": "通过标注复制引用；没有标注的元素仍需要审阅模式选中，本方案未画出"},
        "case_rule_of_step": {"status": "expressed", "scenarioIds": ["sc_an_rule"]},
        "case_meeting": {"status": "expressed", "scenarioIds": ["sc_an_first"], "reason": "依赖“隐藏标注”开关，本版未建模"},
        "case_small_window": {"status": "expressed", "scenarioIds": ["sc_an_first"], "reason": "只有一列 200px 侧栏"}}
rulesC = [{"id": "rule_an_density", "featureId": F, "optionId": C, "text": "每个画面同时显示的标注不超过 5 个，超出时合并为“+N”", "origin": "ai_assumption", "confirmation": "pending", "caseIds": ["case_first_look"], "elementRefs": [f"{SC}#an_anno_rule"]}]
issC = [{"id": "iss_an_cover", "featureId": F, "optionId": C, "text": "标注多了会不会遮住原型本身？场景和情况合成一列后，一个情况对应多个场景怎么办？", "severity": "major", "source": "ai", "refs": ["case_first_look"]}]

patches = [
    ("01-feature.json", p1),
    ("02-option-fold.json", option_patch(1, A, "A · 保留三栏，默认收起", "保留现在的三栏结构，两侧默认收起；工具条上常驻场景数和缺口数，点击后展开对应侧栏",
        "信息呈现方式：结构不变，只改默认显示状态", ["改动最小，现有功能都在原位", "要靠用户记得展开；两侧都展开时又回到拥挤", "缺口数量在工具条上常驻"], sceneA, scA, covA, rulesA, [A], issA)),
    ("03-option-mode.json", option_patch(2, B, "B · 模式决定信息量", "演示模式只有原型、步骤条和顶栏的缺口数量；切到审阅模式，两侧栏才出现",
        "信息密度绑定模式：看演示与做审阅是两种界面", ["演示和会议最干净", "审阅模式仍是三栏，原问题只解决了一半", "切换模式时整个布局跳动"], sceneB, scB, covB, rulesB, [A, B], issB)),
    ("04-option-anno.json", option_patch(3, C, "C · 规则就地标注，情况即场景", "取消右侧检查器：规则以编号标注贴在原型元素旁边；左侧只保留一列“情况”，点已表达的情况直接播放场景，点缺失的情况直接看到缺口",
        "信息组织位置：从“侧栏里的列表”改为“画面上的标注”", ["规则离画面最近，可追溯性最强", "只有一列侧栏，小窗口友好", "改动最大；标注多时可能遮挡原型，需要密度控制"], sceneC, scC, covC, rulesC, [A, B, C], issC)),
]
scenes_patch = base_patch(5, "self_scenes_fix_v1", "修正渲染检查发现的问题：侧栏标签溢出、检查器引用溢出、方案 C 标注贴近按钮",
    [{"op": "upsertScene", "value": x} for x in (sceneA, sceneB, sceneC)])
for sc in (sceneC,):
    pass
patches.append(("06-render-fixes.json", scenes_patch))
for name, p in patches:
    json.dump(p, open(os.path.join(OUT, name), "w"), ensure_ascii=False, indent=2)
print("ok", [n for n, _ in patches])
