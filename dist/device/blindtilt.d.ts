/// <reference types="node" />
/// <reference types="node" />
import { Context } from 'vm';
import { MqttClient } from 'mqtt';
import { Subject } from 'rxjs';
import { SwitchBotPlatform } from '../platform';
import { Service, PlatformAccessory, CharacteristicValue } from 'homebridge';
import { device, devicesConfig, serviceData, switchbot, deviceStatus, ad } from '../settings';
declare enum BlindTiltMappingMode {
    OnlyUp = "only_up",
    OnlyDown = "only_down",
    DownAndUp = "down_and_up",
    UpAndDown = "up_and_down",
    UseTiltForDirection = "use_tilt_for_direction"
}
export declare class BlindTilt {
    private readonly platform;
    private accessory;
    device: device & devicesConfig;
    windowCoveringService: Service;
    lightSensorService?: Service;
    batteryService?: Service;
    CurrentPosition: CharacteristicValue;
    PositionState: CharacteristicValue;
    TargetPosition: CharacteristicValue;
    CurrentAmbientLightLevel?: CharacteristicValue;
    BatteryLevel?: CharacteristicValue;
    StatusLowBattery?: CharacteristicValue;
    CurrentHorizontalTiltAngle: CharacteristicValue;
    TargetHorizontalTiltAngle: CharacteristicValue;
    deviceStatus: any;
    slidePosition: deviceStatus['slidePosition'];
    direction: deviceStatus['direction'];
    moving: deviceStatus['moving'];
    brightness: deviceStatus['brightness'];
    setPositionMode?: string | number;
    Mode: string;
    mappingMode: BlindTiltMappingMode;
    connected?: boolean;
    switchbot: switchbot;
    serviceData: serviceData;
    spaceBetweenLevels: number;
    address: ad['address'];
    calibration: serviceData['calibration'];
    battery: serviceData['battery'];
    position: serviceData['position'];
    inMotion: serviceData['inMotion'];
    lightLevel: serviceData['lightLevel'];
    setNewTarget: boolean;
    setNewTargetTimer: NodeJS.Timeout;
    mqttClient: MqttClient | null;
    set_minStep: number;
    updateRate: number;
    set_minLux: number;
    set_maxLux: number;
    scanDuration: number;
    deviceLogging: string;
    deviceRefreshRate: number;
    setCloseMode: string;
    setOpenMode: string;
    blindTiltUpdateInProgress: boolean;
    doBlindTiltUpdate: Subject<void>;
    private readonly BLE;
    private readonly OpenAPI;
    constructor(platform: SwitchBotPlatform, accessory: PlatformAccessory, device: device & devicesConfig);
    /**
     * Parse the device status from the SwitchBot api
     */
    parseStatus(): Promise<void>;
    BLEparseStatus(): Promise<void>;
    openAPIparseStatus(): Promise<void>;
    refreshStatus(): Promise<void>;
    BLERefreshStatus(): Promise<void>;
    openAPIRefreshStatus(): Promise<void>;
    pushChanges(): Promise<void>;
    BLEpushChanges(): Promise<void>;
    retry({ max, fn }: {
        max: number;
        fn: {
            (): any;
            (): Promise<any>;
        };
    }): Promise<null>;
    maxRetry(): number;
    openAPIpushChanges(): Promise<void>;
    /**
     * Handle requests to set the value of the "Target Horizontal Tilt" characteristic
     */
    TargetHorizontalTiltAngleSet(value: CharacteristicValue): Promise<void>;
    /**
     * Handle requests to set the value of the "Target Position" characteristic
     */
    TargetPositionSet(value: CharacteristicValue): Promise<void>;
    startUpdatingBlindTiltIfNeeded(): Promise<void>;
    updateHomeKitCharacteristics(): Promise<void>;
    mqttPublish(topic: string, message: any): void;
    setupMqtt(device: device & devicesConfig): Promise<void>;
    stopScanning(switchbot: any): Promise<void>;
    getCustomBLEAddress(switchbot: any): Promise<void>;
    BLEPushConnection(): Promise<void>;
    BLERefreshConnection(switchbot: any): Promise<void>;
    SilentPerformance(): Promise<void>;
    setMinMax(): Promise<void>;
    minStep(device: device & devicesConfig): number;
    minLux(): number;
    maxLux(): number;
    scan(device: device & devicesConfig): Promise<void>;
    statusCode(statusCode: number): Promise<void>;
    offlineOff(): Promise<void>;
    apiError(e: any): Promise<void>;
    FirmwareRevision(accessory: PlatformAccessory<Context>, device: device & devicesConfig): CharacteristicValue;
    context(): Promise<void>;
    /**
     * Maps device values to homekit values
     *
     * @param devicePosition the position as reported by the devide
     * @param direction the direction as reported by the device
     * @returns [homekit position, homekit tiltAngle]
     */
    mapDeviceValuesToHomekitValues(devicePosition: number, deviceDirection: string): [CharacteristicValue, CharacteristicValue?];
    /**
     * Maps homekit values to device values
     *
     * @param homekitPosition the position as reported by homekit
     * @param homekitTiltAngle? the tilt angle as reported by homekit
     * @returns [device position, device direction]
     */
    mapHomekitValuesToDeviceValues(homekitPosition: number, homekitTiltAngle: number): [string, number];
    refreshRate(device: device & devicesConfig): Promise<void>;
    config(device: device & devicesConfig): Promise<void>;
    logs(device: device & devicesConfig): Promise<void>;
    /**
     * Logging for Device
     */
    infoLog(...log: any[]): void;
    warnLog(...log: any[]): void;
    debugWarnLog(...log: any[]): void;
    errorLog(...log: any[]): void;
    debugErrorLog(...log: any[]): void;
    debugLog(...log: any[]): void;
    enablingDeviceLogging(): boolean;
}
export {};
//# sourceMappingURL=blindtilt.d.ts.map