using System.Net;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;

namespace F16Hud;

/// <summary>
/// Табло разминки у всех игроков сервера. Команды шлёт агент F16 через RCON (игроки вызвать не могут):
///   f16_hud &lt;секунды&gt; &lt;заголовок|строка|строка&gt;  — показать; между заголовком и остальным
///                                                  вставляются строки состава (кто не готов / не зашёл)
///   f16_roster &lt;ключ&gt;#&lt;команда 1&gt;#&lt;id=ник,...&gt;#&lt;команда 2&gt;#&lt;id=ник,...&gt; — состав матча
///   f16_hud_ready 0|1   — показывать ли «не готовы» (нужно, пока игроки пишут .r)
///   f16_hud_mode alert|html|hint — где показывать (по умолчанию alert: в разминке не мигает)
///   f16_hud_clear       — убрать
/// Готовность плагин считает сам по чату: .r / .ready — готов, .ur / .unready / .notready — не готов.
/// </summary>
public class F16Hud : BasePlugin
{
    public override string ModuleName => "F16 HUD";
    public override string ModuleVersion => "1.5.0";
    public override string ModuleAuthor => "F16 Arena";

    private DateTime _until;
    private bool _shown;
    private int _tick;
    private string _mode = "alert";
    private List<string> _lines = new();

    // состав матча: команда → (SteamID → ник)
    private string _rosterKey = "";
    private readonly List<(string Name, Dictionary<ulong, string> Players)> _teams = new();
    private readonly HashSet<ulong> _ready = new();
    private bool _readyMode;

    private static readonly HashSet<string> ReadyCmds = new(StringComparer.OrdinalIgnoreCase) { ".r", ".ready", "!r", "!ready" };
    private static readonly HashSet<string> UnreadyCmds = new(StringComparer.OrdinalIgnoreCase) { ".ur", ".unready", ".notready", "!unready", "!notready" };

    public override void Load(bool hotReload)
    {
        AddCommandListener("say", OnSay);
        AddCommandListener("say_team", OnSay);
        RegisterListener<Listeners.OnMapStart>(_ => _ready.Clear());
        RegisterEventHandler<EventPlayerDisconnect>((ev, _) =>
        {
            if (ev.Userid is { IsValid: true } p) _ready.Remove(p.SteamID);
            return HookResult.Continue;
        });

        RegisterListener<Listeners.OnTick>(() =>
        {
            if (!_shown) return;
            if (DateTime.UtcNow > _until)
            {
                _shown = false;
                return;
            }
            // раз в ~0,25 с: окно не успевает погаснуть, а клиенту не прилетает 64 обновления в секунду
            if (++_tick % 16 != 0) return;
            // табло — только для разминки: начался нож или игра — убираем сразу, не дожидаясь агента
            if (!InWarmup())
            {
                _shown = false;
                return;
            }
            var lines = Compose();
            var plain = string.Join("\n", lines);
            var html = lines.Count == 0
                ? ""
                : $"<font class='fontSize-m' color='#7fb2ff'>{WebUtility.HtmlEncode(lines[0])}</font>" +
                  string.Concat(lines.Skip(1).Select(l => $"<br><font class='fontSize-s' color='#ffffff'>{WebUtility.HtmlEncode(l)}</font>"));
            foreach (var p in Utilities.GetPlayers())
            {
                if (p is not { IsValid: true, IsBot: false, IsHLTV: false }) continue;
                if (_mode == "html") p.PrintToCenterHtml(html, 1);
                else if (_mode == "hint") p.PrintToCenter(plain);
                else p.PrintToCenterAlert(plain);
            }
        });
    }

    private static bool InWarmup()
    {
        var rules = Utilities.FindAllEntitiesByDesignerName<CCSGameRulesProxy>("cs_gamerules").FirstOrDefault()?.GameRules;
        return rules?.WarmupPeriod ?? true;
    }

    /// <summary>Заголовок, затем по строке на команду (кто не готов), «Не зашли», затем остальные строки агента</summary>
    private List<string> Compose()
    {
        var result = new List<string>();
        if (_lines.Count > 0) result.Add(_lines[0]);
        var rest = _lines.Skip(1).ToList();
        if (_teams.Count > 0)
        {
            var online = Utilities.GetPlayers().Where(p => p is { IsValid: true, IsBot: false, IsHLTV: false }).Select(p => p.SteamID).ToHashSet();
            var missing = new List<string>();
            foreach (var (name, players) in _teams)
            {
                var notReady = players.Where(kv => online.Contains(kv.Key) && !_ready.Contains(kv.Key)).Select(kv => kv.Value).ToList();
                missing.AddRange(players.Where(kv => !online.Contains(kv.Key)).Select(kv => kv.Value));
                if (!_readyMode) continue;
                var here = players.Count(kv => online.Contains(kv.Key));
                if (notReady.Count > 0) result.Add($"{name}: не готовы — {string.Join(", ", notReady)}");
                else if (here == players.Count) result.Add($"{name}: все готовы ✓");
                else if (here > 0) result.Add($"{name}: готовы все, кто зашёл");
            }
            if (missing.Count > 0) result.Add($"Не зашли: {string.Join(", ", missing)}");
        }
        result.AddRange(rest);
        return result;
    }

    private HookResult OnSay(CCSPlayerController? player, CommandInfo info)
    {
        if (player is not { IsValid: true }) return HookResult.Continue;
        var msg = info.GetArg(1).Trim();
        if (ReadyCmds.Contains(msg)) _ready.Add(player.SteamID);
        else if (UnreadyCmds.Contains(msg)) _ready.Remove(player.SteamID);
        return HookResult.Continue;
    }

    private static string ArgText(CommandInfo command, bool skipFirst)
    {
        var text = command.ArgString.Trim();
        if (skipFirst)
        {
            var space = text.IndexOf(' ');
            text = space >= 0 ? text[(space + 1)..] : "";
        }
        return text.Trim().Trim('"');
    }

    [ConsoleCommand("f16_hud", "F16: табло разминки")]
    public void OnHud(CCSPlayerController? player, CommandInfo command)
    {
        if (player != null) return;
        if (command.ArgCount < 3 || !int.TryParse(command.ArgByIndex(1), out var seconds)) return;
        var lines = ArgText(command, true).Split('|', StringSplitOptions.RemoveEmptyEntries).Select(l => l.Trim()).ToList();
        if (lines.Count == 0) return;
        _lines = lines;
        _shown = true;
        _until = DateTime.UtcNow.AddSeconds(Math.Clamp(seconds, 1, 120));
    }

    [ConsoleCommand("f16_roster", "F16: состав матча для табло")]
    public void OnRoster(CCSPlayerController? player, CommandInfo command)
    {
        if (player != null) return;
        var parts = ArgText(command, false).Split('#');
        if (parts.Length < 5 || parts[0] == _rosterKey) return;
        _rosterKey = parts[0];
        _teams.Clear();
        _ready.Clear();
        for (var i = 1; i + 1 < parts.Length; i += 2)
        {
            var players = new Dictionary<ulong, string>();
            foreach (var entry in parts[i + 1].Split(',', StringSplitOptions.RemoveEmptyEntries))
            {
                var kv = entry.Split('=', 2);
                if (kv.Length == 2 && ulong.TryParse(kv[0], out var id)) players[id] = kv[1];
            }
            _teams.Add((parts[i], players));
        }
    }

    [ConsoleCommand("f16_hud_ready", "F16: показывать «не готовы» (0/1)")]
    public void OnHudReady(CCSPlayerController? player, CommandInfo command)
    {
        if (player != null) return;
        _readyMode = command.ArgByIndex(1) == "1";
    }

    [ConsoleCommand("f16_hud_mode", "F16: где показывать — alert | html | hint")]
    public void OnHudMode(CCSPlayerController? player, CommandInfo command)
    {
        if (player != null) return;
        var m = command.ArgByIndex(1);
        if (m is "html" or "alert" or "hint") _mode = m;
        command.ReplyToCommand($"f16_hud_mode = {_mode}");
    }

    [ConsoleCommand("f16_hud_clear", "F16: убрать табло")]
    public void OnHudClear(CCSPlayerController? player, CommandInfo command)
    {
        if (player != null) return;
        _shown = false;
    }
}
