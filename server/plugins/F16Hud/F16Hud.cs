using System.Net;
using CounterStrikeSharp.API;
using CounterStrikeSharp.API.Core;
using CounterStrikeSharp.API.Core.Attributes.Registration;
using CounterStrikeSharp.API.Modules.Commands;

namespace F16Hud;

/// <summary>
/// Окно по центру экрана у всех игроков сервера. Команду шлёт агент F16 через RCON:
///   f16_hud &lt;секунды&gt; &lt;строка 1|строка 2|строка 3&gt;   — показать (первая строка — заголовок)
///   f16_hud_clear                                    — убрать
/// Только с консоли сервера (RCON), игроки вызвать не могут. Текст экранируется.
/// </summary>
public class F16Hud : BasePlugin
{
    public override string ModuleName => "F16 HUD";
    public override string ModuleVersion => "1.1.0";
    public override string ModuleAuthor => "F16 Arena";

    private string? _html;
    private DateTime _until;

    public override void Load(bool hotReload)
    {
        RegisterListener<Listeners.OnTick>(() =>
        {
            if (_html == null) return;
            if (DateTime.UtcNow > _until)
            {
                _html = null;
                return;
            }
            // центр экрана гаснет между обновлениями — шлём на каждом тике, иначе окно мерцает
            foreach (var p in Utilities.GetPlayers())
            {
                if (p is { IsValid: true, IsBot: false, IsHLTV: false }) p.PrintToCenterHtml(_html);
            }
        });
    }

    [ConsoleCommand("f16_hud", "F16: окно по центру экрана")]
    public void OnHud(CCSPlayerController? player, CommandInfo command)
    {
        if (player != null) return; // только сервер / RCON
        if (command.ArgCount < 3 || !int.TryParse(command.ArgByIndex(1), out var seconds)) return;
        var text = command.ArgString;
        var space = text.IndexOf(' ');
        text = space >= 0 ? text[(space + 1)..].Trim().Trim('"') : "";
        var lines = text.Split('|', StringSplitOptions.RemoveEmptyEntries).Select(l => WebUtility.HtmlEncode(l.Trim())).ToList();
        if (lines.Count == 0) return;
        // окно в CS2 узкое: заголовок — средним, остальное — мелким, чтобы строки не переносились
        var html = $"<font class='fontSize-m' color='#7fb2ff'>{lines[0]}</font>";
        foreach (var l in lines.Skip(1)) html += $"<br><font class='fontSize-s' color='#ffffff'>{l}</font>";
        _html = html;
        _until = DateTime.UtcNow.AddSeconds(Math.Clamp(seconds, 1, 120));
    }

    [ConsoleCommand("f16_hud_clear", "F16: убрать окно")]
    public void OnHudClear(CCSPlayerController? player, CommandInfo command)
    {
        if (player != null) return;
        _html = null;
    }
}
