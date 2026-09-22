-- NetsuCast helper loaded into mpv.
-- mpv only reports "loading failed" when yt-dlp gives up; the real reason is in the log. This
-- keeps the last yt-dlp error in a property the app observes (user-data/netsucast/ytdl-error).

local KEY = "user-data/netsucast/ytdl-error"

mp.set_property_native(KEY, "")
mp.enable_messages("error")

mp.register_event("log-message", function(e)
    if e.prefix == "ytdl_hook" and e.text:find("^ERROR") then
        mp.set_property_native(KEY, (e.text:gsub("%s+$", "")))
    end
end)

mp.register_event("start-file", function()
    mp.set_property_native(KEY, "")
end)
