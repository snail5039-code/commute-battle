export {};

declare global {
  interface Window {
    kakao: typeof kakao;
  }

  namespace kakao.maps {
    function load(callback: () => void): void;

    class LatLng {
      constructor(lat: number, lng: number);
      getLat(): number;
      getLng(): number;
    }

    class Map {
      constructor(container: HTMLElement, options: { center: LatLng; level: number });
      setCenter(latlng: LatLng): void;
      panTo(latlng: LatLng): void;
      setLevel(level: number): void;
      getLevel(): number;
      setBounds(bounds: LatLngBounds): void;
    }

    class LatLngBounds {
      constructor();
      extend(latlng: LatLng): void;
    }

    class Marker {
      constructor(options: { position: LatLng; map?: Map; image?: MarkerImage });
      setMap(map: Map | null): void;
      setPosition(latlng: LatLng): void;
    }

    class MarkerImage {
      constructor(src: string, size: Size, options?: { offset?: Point });
    }

    class Size {
      constructor(width: number, height: number);
    }

    class Point {
      constructor(x: number, y: number);
    }

    class Circle {
      constructor(options: {
        center: LatLng;
        radius: number;
        strokeWeight?: number;
        strokeColor?: string;
        strokeOpacity?: number;
        strokeStyle?: string;
        fillColor?: string;
        fillOpacity?: number;
      });
      setMap(map: Map | null): void;
      setPosition(latlng: LatLng): void;
      setRadius(radius: number): void;
    }

    class Polyline {
      constructor(options: {
        path: LatLng[];
        strokeWeight?: number;
        strokeColor?: string;
        strokeOpacity?: number;
        strokeStyle?: string;
      });
      setMap(map: Map | null): void;
      setPath(path: LatLng[]): void;
    }

    class CustomOverlay {
      constructor(options: {
        position: LatLng;
        content: string | HTMLElement;
        yAnchor?: number;
        zIndex?: number;
      });
      setMap(map: Map | null): void;
      setPosition(latlng: LatLng): void;
    }

    interface MouseEvent {
      latLng: LatLng;
    }

    namespace event {
      function addListener(
        target: Map,
        type: string,
        handler: (event: MouseEvent) => void
      ): void;
      function removeListener(
        target: Map,
        type: string,
        handler: (event: MouseEvent) => void
      ): void;
    }

    namespace services {
      enum Status {
        OK = 'OK',
        ZERO_RESULT = 'ZERO_RESULT',
        ERROR = 'ERROR',
      }

      interface AddressSearchResult {
        x: string;
        y: string;
        address_name: string;
      }

      class Geocoder {
        addressSearch(
          address: string,
          callback: (result: AddressSearchResult[], status: Status) => void
        ): void;
      }
    }
  }
}
