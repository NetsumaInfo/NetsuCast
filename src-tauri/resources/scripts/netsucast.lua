-- NetsuCast helper loaded into mpv. It publishes, in user-data properties the app observes, what
-- the app would otherwise have to poll over IPC (one pipe connection per value):
--   user-data/netsucast/ytdl-error  the last yt-dlp error (mpv itself only says "loading failed")
--   user-data/netsucast/upscale     what the GPU ran on the last frames, once a second
--   user-data/netsucast/info        stream details, once a second while the app sets
--                                   user-data/netsucast/want-info (its info panel is open)

local YTDL_ERROR = "user-data/netsucast/ytdl-error"
local UPSCALE = "user-data/netsucast/upscale"
local INFO = "user-data/netsucast/info"
local WANT_INFO = "user-data/netsucast/want-info"

mp.set_property_native(YTDL_ERROR, "")
mp.enable_messages("error")

mp.register_event("log-message", function(e)
    if e.prefix == "ytdl_hook" and e.text:find("^ERROR") then
        mp.set_property_native(YTDL_ERROR, (e.text:gsub("%s+$", "")))
    end
end)

mp.register_event("start-file", function()
    mp.set_property_native(YTDL_ERROR, "")
    mp.del_property(UPSCALE)
end)

-- Rounded, so an unchanged picture does not notify the app every second.
local function ms(ns)
    return math.floor(ns / 1e5 + 0.5) / 10
end

local function publish_upscale()
    local passes = mp.get_property_native("vo-passes")
    local fresh = passes and passes.fresh
    if not fresh or #fresh == 0 then return end -- paused: nothing rendered lately
    local count, artcnn, frame = 0, 0, 0
    for _, pass in ipairs(fresh) do
        local avg = pass.avg or 0
        frame = frame + avg
        if pass.desc and pass.desc:find("^ArtCNN") then
            artcnn = artcnn + avg
            -- Every ArtCNN shader starts with exactly one "(Conv2D)" pass.
            if pass.desc:find("%(Conv2D%)$") then count = count + 1 end
        end
    end
    mp.set_property_native(UPSCALE, { passes = count, artcnnMs = ms(artcnn), frameMs = ms(frame) })
end

local INFO_PROPS = {
    path = "path",
    fileFormat = "file-format",
    videoFormat = "video-format",
    videoBitrate = "video-bitrate",
    videoParams = "video-params",
    audioCodec = "audio-codec-name",
    audioBitrate = "audio-bitrate",
    audioParams = "audio-params",
    hlsBitrate = "hls-bitrate",
    cacheDuration = "demuxer-cache-duration",
    cacheSpeed = "cache-speed",
    displayFps = "display-fps",
    gpuContext = "current-gpu-context",
}

local function publish_info()
    local info = {}
    for key, prop in pairs(INFO_PROPS) do
        info[key] = mp.get_property_native(prop)
    end
    mp.set_property_native(INFO, info)
end

mp.add_periodic_timer(1, function()
    if mp.get_property_native("idle-active") then return end
    publish_upscale()
    if mp.get_property_native(WANT_INFO) then publish_info() end
end)

mp.observe_property(WANT_INFO, "native", function(_, want)
    if want then publish_info() end
end)
