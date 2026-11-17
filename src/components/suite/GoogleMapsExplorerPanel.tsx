import React, { useCallback, useEffect, useState } from 'react';
import {
  APIProvider,
  AdvancedMarker,
  InfoWindow,
  Map as GoogleMap,
  Pin,
  useAdvancedMarkerRef,
} from '@vis.gl/react-google-maps';
import { Compass, ExternalLink, Loader2, MapPin, Navigation, Search } from 'lucide-react';

interface SitePin {
  id: string;
  name: string;
  region: string;
  focus: string;
  lat: number;
  lng: number;
}

const DEFAULT_SITES: SitePin[] = [
  {
    id: 'site-1',
    name: 'ETH Zurich Crop Science Field Station',
    region: 'Lindau, Switzerland',
    focus: 'UAV hyperspectral canopy & phenotyping trials',
    lat: 47.4496,
    lng: 8.6822,
  },
  {
    id: 'site-2',
    name: 'Wageningen Precision Ag Research',
    region: 'Wageningen, Netherlands',
    focus: 'Spatial cross-validation & soil moisture remote sensing',
    lat: 51.9692,
    lng: 5.6654,
  },
  {
    id: 'site-3',
    name: 'UC Davis Agricultural Robotics Plot',
    region: 'Davis, CA, USA',
    focus: 'Real-time edge-AI UAV latency benchmarking',
    lat: 38.5382,
    lng: -121.7617,
  },
  {
    id: 'site-4',
    name: 'Rothamsted Long-Term Experimental Site',
    region: 'Harpenden, UK',
    focus: 'Multi-season ecological resilience & sensor calibration',
    lat: 51.8096,
    lng: -0.3563,
  },
];

const SiteMarkerWithInfo: React.FC<{
  site: SitePin;
  isSelected: boolean;
  onSelect: (id: string | null) => void;
}> = ({ site, isSelected, onSelect }) => {
  const [markerRef, marker] = useAdvancedMarkerRef();

  return (
    <>
      <AdvancedMarker
        ref={markerRef}
        position={{ lat: site.lat, lng: site.lng }}
        onClick={() => onSelect(site.id)}
        title={site.name}
      >
        <Pin background="#0d9488" borderColor="#115e59" glyphColor="#ffffff" scale={1.1} />
      </AdvancedMarker>

      {isSelected && marker && (
        <InfoWindow anchor={marker} maxWidth={240} onCloseClick={() => onSelect(null)}>
          <div className="text-slate-900 space-y-1 p-0.5">
            <p className="font-bold text-xs">{site.name}</p>
            <p className="text-[11px] text-slate-600">{site.region}</p>
            <p className="text-[11px] text-slate-700">{site.focus}</p>
          </div>
        </InfoWindow>
      )}
    </>
  );
};

interface GroundedPlace {
  title: string;
  uri: string;
  snippets: string[];
}

export const GoogleMapsExplorerPanel: React.FC = () => {
  const [mapsApiKey, setMapsApiKey] = useState<string>(
    import.meta.env.VITE_GOOGLE_MAPS_API_KEY || ''
  );
  const [loadingKey, setLoadingKey] = useState<boolean>(!import.meta.env.VITE_GOOGLE_MAPS_API_KEY);
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>('site-1');
  const [cameraCenter, setCameraCenter] = useState<{ lat: number; lng: number }>({
    lat: 47.4496,
    lng: 8.6822,
  });
  const [cameraZoom, setCameraZoom] = useState<number>(4);

  // Maps Grounding query state
  const [groundingQuery, setGroundingQuery] = useState(
    'Major agricultural research institutes and remote sensing labs near Zurich'
  );
  const [groundingLoading, setGroundingLoading] = useState(false);
  const [groundingAnswer, setGroundingAnswer] = useState('');
  const [groundedPlaces, setGroundedPlaces] = useState<GroundedPlace[]>([]);
  const [groundingError, setGroundingError] = useState('');
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    if (mapsApiKey) {
      setLoadingKey(false);
      return;
    }
    let mounted = true;
    fetch('/api/maps/config')
      .then((r) => r.json())
      .then((data) => {
        if (mounted && data?.apiKey) {
          setMapsApiKey(data.apiKey);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setLoadingKey(false);
      });
    return () => {
      mounted = false;
    };
  }, [mapsApiKey]);

  const handleUseCurrentLocation = useCallback(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setUserCoords(coords);
        setCameraCenter(coords);
        setCameraZoom(11);
      },
      () => {
        // Ignore geolocation denial cleanly
      }
    );
  }, []);

  const handleMapsGroundingSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groundingQuery.trim() || groundingLoading) return;
    setGroundingLoading(true);
    setGroundingError('');

    try {
      const res = await fetch('/api/gemini/maps-grounding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: groundingQuery.trim(),
          lat: userCoords?.lat ?? cameraCenter.lat,
          lng: userCoords?.lng ?? cameraCenter.lng,
        }),
      });
      if (res.status === 429) {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      const data = await res.json();
      if (data?.error?.status === 'RESOURCE_EXHAUSTED') {
        window.dispatchEvent(new CustomEvent('gmp-quota-exceeded'));
      }
      if (!res.ok) throw new Error(data.error || 'Maps grounding query failed');

      setGroundingAnswer(data.text || '');
      setGroundedPlaces(Array.isArray(data.places) ? data.places : []);
    } catch (err: any) {
      setGroundingError(err?.message || 'Unable to query Google Maps grounding.');
    } finally {
      setGroundingLoading(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
      {/* Left 7 cols: Interactive Google Map (@vis.gl/react-google-maps) */}
      <div className="lg:col-span-7 bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden flex flex-col">
        <div className="p-3.5 bg-slate-950/70 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <MapPin className="w-4 h-4 text-teal-400" />
            <span className="text-xs font-bold text-white">Study Site Explorer (Google Maps)</span>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {DEFAULT_SITES.map((site) => (
              <button
                key={site.id}
                type="button"
                onClick={() => {
                  setSelectedSiteId(site.id);
                  setCameraCenter({ lat: site.lat, lng: site.lng });
                  setCameraZoom(12);
                }}
                className={`px-2 py-1 rounded-lg text-[10px] font-semibold transition cursor-pointer ${
                  selectedSiteId === site.id
                    ? 'bg-teal-600 text-white'
                    : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
                }`}
              >
                {site.region.split(',')[0]}
              </button>
            ))}
            <button
              type="button"
              onClick={handleUseCurrentLocation}
              className="px-2 py-1 rounded-lg text-[10px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white inline-flex items-center gap-1 cursor-pointer"
              title="Center map on your current coordinates"
            >
              <Navigation className="w-3 h-3" />
              <span>Near Me</span>
            </button>
          </div>
        </div>

        <div className="w-full h-[430px] relative bg-slate-950">
          {loadingKey ? (
            <div className="h-full flex items-center justify-center text-xs text-slate-400 gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-teal-400" />
              <span>Loading Google Maps...</span>
            </div>
          ) : !mapsApiKey ? (
            <div className="h-full flex flex-col items-center justify-center p-6 text-center space-y-2">
              <Compass className="w-8 h-8 text-slate-500" />
              <p className="text-xs font-semibold text-slate-300">
                Google Maps API key not present in runtime environment
              </p>
              <p className="text-[11px] text-slate-500 max-w-sm">
                Ensure your provisioned `VITE_GOOGLE_MAPS_API_KEY` or `GOOGLE_MAPS_API_KEY` secret is active in Settings, then reload the workspace.
              </p>
            </div>
          ) : (
            <APIProvider apiKey={mapsApiKey} libraries={['marker']} language="en" region="US">
              <GoogleMap
                mapId="DEMO_MAP_ID"
                center={cameraCenter}
                zoom={cameraZoom}
                onCameraChanged={(ev) => {
                  setCameraCenter(ev.detail.center);
                  setCameraZoom(ev.detail.zoom);
                }}
                internalUsageAttributionIds={['gmp_mcp_codeassist_v1_aistudio']}
                gestureHandling="greedy"
                style={{ width: '100%', height: '100%' }}
              >
                {DEFAULT_SITES.map((site) => (
                  <SiteMarkerWithInfo
                    key={site.id}
                    site={site}
                    isSelected={selectedSiteId === site.id}
                    onSelect={setSelectedSiteId}
                  />
                ))}
              </GoogleMap>
            </APIProvider>
          )}
        </div>
      </div>

      {/* Right 5 cols: Gemini Maps Grounding */}
      <div className="lg:col-span-5 bg-slate-900 border border-slate-800 rounded-2xl p-4 flex flex-col h-[488px]">
        <div className="space-y-1 mb-3">
          <h3 className="text-xs font-bold text-white flex items-center gap-2">
            <Search className="w-4 h-4 text-indigo-400" />
            <span>Google Maps AI Grounding (`gemini-4-hydrogen`)</span>
          </h3>
          <p className="text-[11px] text-slate-400">
            Query geographic sites, field stations, and places anchored to live Google Maps records.
          </p>
        </div>

        <form onSubmit={handleMapsGroundingSearch} className="flex items-center gap-2 mb-3">
          <input
            type="text"
            value={groundingQuery}
            onChange={(e) => setGroundingQuery(e.target.value)}
            placeholder="Search real-world places or research sites..."
            className="flex-1 px-3 py-2 bg-slate-950 border border-slate-800 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
          />
          <button
            type="submit"
            disabled={groundingLoading || !groundingQuery.trim()}
            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl cursor-pointer disabled:opacity-50"
          >
            {groundingLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Search'}
          </button>
        </form>

        {groundingError && (
          <div className="p-2.5 mb-3 bg-rose-950/50 border border-rose-500/40 rounded-xl text-xs text-rose-200">
            {groundingError}
          </div>
        )}

        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {!groundingAnswer && groundedPlaces.length === 0 ? (
            <div className="text-xs text-slate-500 text-center py-14 border border-dashed border-slate-800 rounded-xl">
              Submit a geographic query to inspect AI answers grounded in Google Maps place links and review snippets.
            </div>
          ) : (
            <>
              {groundingAnswer && (
                <div className="p-3 bg-slate-950 border border-slate-800 rounded-xl text-xs text-slate-200 leading-relaxed whitespace-pre-wrap">
                  {groundingAnswer}
                </div>
              )}

              {groundedPlaces.length > 0 && (
                <div className="space-y-2">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-teal-400">
                    Google Maps Grounded Place Links
                  </p>
                  {groundedPlaces.map((place, idx) => (
                    <div
                      key={`${place.title}_${idx}`}
                      className="p-2.5 bg-slate-950 border border-slate-800 rounded-xl space-y-1.5"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">{place.title}</span>
                        {place.uri && (
                          <a
                            href={place.uri}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[11px] text-teal-300 hover:underline shrink-0"
                          >
                            <span>Open in Maps</span>
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        )}
                      </div>
                      {place.snippets.map((snippet, sIdx) => (
                        <p key={sIdx} className="text-[11px] text-slate-400 italic">
                          "{snippet}"
                        </p>
                      ))}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};
