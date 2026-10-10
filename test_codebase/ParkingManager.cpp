/**
 * =====================================================================================
 * ParkingManager.cpp - Automated Multi-Level Parking Management System
 * =====================================================================================
 * Target: RAGScript Codebase Ingestion & Context-Aware Retrieval Benchmark
 * Demonstrates:
 *   1. Dynamic memory allocation (raw pointers, heap buffer resizing, Rule of Three)
 *   2. Linear array shifting algorithms (left-shift compaction and right-shift insertion)
 *   3. Object-oriented architecture with error handling and resource cleanup
 * =====================================================================================
 */

#include <iostream>
#include <string>
#include <stdexcept>
#include <chrono>
#include <iomanip>

// Enum representing the type of vehicle
enum class VehicleType {
    SEDAN,
    SUV,
    TRUCK,
    ELECTRIC,
    EMERGENCY
};

/**
 * Class representing an individual vehicle parked in the system.
 */
class Vehicle {
private:
    std::string licensePlate;
    VehicleType type;
    std::chrono::system_clock::time_point entryTime;
    bool isVip;

public:
    Vehicle(const std::string& plate, VehicleType vType, bool vip = false)
        : licensePlate(plate), type(vType), isVip(vip) {
        entryTime = std::chrono::system_clock::now();
    }

    const std::string& getLicensePlate() const { return licensePlate; }
    VehicleType getType() const { return type; }
    bool getIsVip() const { return isVip; }

    std::string getTypeString() const {
        switch (type) {
            case VehicleType::SEDAN:     return "Sedan";
            case VehicleType::SUV:       return "SUV";
            case VehicleType::TRUCK:     return "Truck";
            case VehicleType::ELECTRIC:  return "Electric";
            case VehicleType::EMERGENCY: return "Emergency";
            default:                     return "Unknown";
        }
    }
};

/**
 * Class ParkingManager
 * Manages contiguous parking slots backed by dynamically allocated memory buffers.
 */
class ParkingManager {
private:
    Vehicle** slots;     // Dynamically allocated array of Vehicle pointers (Vehicle*[])
    int capacity;        // Maximum allocated slot capacity
    int currentCount;    // Current number of occupied slots

    /**
     * Internal Memory Management: Resizes the dynamic buffer when full.
     * Allocates a new array on the heap, migrates pointers, and releases old buffer.
     */
    void resizeBuffer(int newCapacity) {
        std::cout << "[MEMORY] Expanding parking lot buffer from " 
                  << capacity << " to " << newCapacity << " slots.\n";

        // Step 1: Allocate new contiguous buffer on the heap
        Vehicle** newSlots = new Vehicle*[newCapacity];

        // Initialize all slots in the new buffer to nullptr
        for (int i = 0; i < newCapacity; ++i) {
            newSlots[i] = nullptr;
        }

        // Step 2: Shallow copy pointers from old slots to new buffer
        for (int i = 0; i < currentCount; ++i) {
            newSlots[i] = slots[i];
        }

        // Step 3: Deallocate old buffer array (note: vehicle objects are preserved)
        delete[] slots;

        // Step 4: Re-bind pointer and update capacity metric
        slots = newSlots;
        capacity = newCapacity;
    }

public:
    /**
     * Constructor: Initializes parking lot with an initial dynamic capacity.
     */
    explicit ParkingManager(int initialCapacity = 10)
        : capacity(initialCapacity), currentCount(0) {
        if (initialCapacity <= 0) {
            throw std::invalid_argument("Initial capacity must be greater than zero.");
        }

        // Dynamic heap allocation for vehicle pointer table
        slots = new Vehicle*[capacity];
        for (int i = 0; i < capacity; ++i) {
            slots[i] = nullptr;
        }
        std::cout << "[INIT] ParkingManager instantiated with " << capacity << " slots on heap.\n";
    }

    /**
     * Destructor: Rule of Three compliance.
     * Iterates over all occupied slots, deletes individual Vehicle objects,
     * and finally deallocates the pointer array itself to prevent memory leaks.
     */
    ~ParkingManager() {
        std::cout << "[CLEANUP] Releasing all allocated parking memory...\n";
        for (int i = 0; i < currentCount; ++i) {
            if (slots[i] != nullptr) {
                delete slots[i];    // Free heap memory for vehicle
                slots[i] = nullptr;
            }
        }
        delete[] slots;            // Free heap memory for slots pointer array
        slots = nullptr;
        currentCount = 0;
        capacity = 0;
    }

    // Disable copy constructor and copy assignment to enforce single ownership
    ParkingManager(const ParkingManager&) = delete;
    ParkingManager& operator=(const ParkingManager&) = delete;

    /**
     * Park Vehicle (Append Operation):
     * Places a vehicle at the next available slot at the end of the array.
     */
    bool parkVehicle(const std::string& plate, VehicleType type, bool isVip = false) {
        // Trigger dynamic memory reallocation if capacity is exhausted
        if (currentCount >= capacity) {
            resizeBuffer(capacity * 2);
        }

        // Dynamically instantiate Vehicle on heap
        slots[currentCount] = new Vehicle(plate, type, isVip);
        std::cout << "[PARK] Vehicle " << plate << " parked at slot index " << currentCount << ".\n";
        currentCount++;
        return true;
    }

    /**
     * ARRAY SHIFTING ALGORITHM 1: Left-Shift Removal
     * Locates a vehicle by license plate, frees its memory, and shifts all
     * trailing vehicles one position to the left to maintain contiguous storage.
     */
    bool removeVehicle(const std::string& plate) {
        int targetIndex = -1;

        // Step 1: Linear scan to find slot index
        for (int i = 0; i < currentCount; ++i) {
            if (slots[i] != nullptr && slots[i]->getLicensePlate() == plate) {
                targetIndex = i;
                break;
            }
        }

        if (targetIndex == -1) {
            std::cerr << "[ERROR] Vehicle with plate " << plate << " not found.\n";
            return false;
        }

        // Step 2: Dynamic Memory Deallocation for departing vehicle
        delete slots[targetIndex];
        slots[targetIndex] = nullptr;

        // Step 3: Array Shifting Algorithm (Left Shift)
        // Shift all subsequent pointers leftwards: slots[j] = slots[j + 1]
        for (int j = targetIndex; j < currentCount - 1; ++j) {
            slots[j] = slots[j + 1];
        }

        // Step 4: Clear trailing slot and decrement count
        slots[currentCount - 1] = nullptr;
        currentCount--;

        std::cout << "[DEPART] Vehicle " << plate << " departed. Array shifted left. Active slots: " 
                  << currentCount << "/" << capacity << ".\n";
        return true;
    }

    /**
     * ARRAY SHIFTING ALGORITHM 2: Right-Shift Priority Insertion
     * Inserts an emergency or VIP vehicle at a designated priority slot (e.g., slot 0).
     * Shifts existing elements to the right to create an opening without overwriting.
     */
    bool insertPriorityVehicle(const std::string& plate, VehicleType type, int targetSlot = 0) {
        if (targetSlot < 0 || targetSlot > currentCount) {
            throw std::out_of_range("Target priority slot is out of valid range.");
        }

        // Ensure sufficient capacity
        if (currentCount >= capacity) {
            resizeBuffer(capacity * 2);
        }

        // Array Shifting Algorithm (Right Shift)
        // Walk backwards from currentCount down to targetSlot + 1
        for (int j = currentCount; j > targetSlot; --j) {
            slots[j] = slots[j - 1]; // Shift pointer one position right
        }

        // Insert new priority vehicle at the vacated slot
        slots[targetSlot] = new Vehicle(plate, type, true);
        currentCount++;

        std::cout << "[PRIORITY] Priority vehicle " << plate 
                  << " inserted at slot " << targetSlot 
                  << " via right-shift. Active count: " << currentCount << ".\n";
        return true;
    }

    /**
     * Status Display: Prints the current slot occupancy state.
     */
    void displayParkingStatus() const {
        std::cout << "\n================ PARKING LOT STATUS ================\n";
        std::cout << "Capacity: " << capacity << " | Occupied: " << currentCount << "\n";
        for (int i = 0; i < currentCount; ++i) {
            if (slots[i] != nullptr) {
                std::cout << "  Slot [" << i << "]: " 
                          << slots[i]->getLicensePlate() 
                          << " (" << slots[i]->getTypeString() << ")"
                          << (slots[i]->getIsVip() ? " [VIP]" : "") << "\n";
            }
        }
        std::cout << "====================================================\n\n";
    }

    int getOccupiedCount() const { return currentCount; }
    int getCapacity() const { return capacity; }
};

// =====================================================================================
// Demonstration Entrypoint
// =====================================================================================
int main() {
    try {
        ParkingManager manager(3); // Small capacity to trigger resizing early

        // 1. Initial Parks (triggers resize from 3 -> 6)
        manager.parkVehicle("ABC-101", VehicleType::SEDAN);
        manager.parkVehicle("XYZ-202", VehicleType::SUV);
        manager.parkVehicle("EV-303", VehicleType::ELECTRIC);
        manager.parkVehicle("TRK-404", VehicleType::TRUCK);

        manager.displayParkingStatus();

        // 2. Test Array Shifting (Left Shift Removal)
        std::cout << "--> Removing XYZ-202 (Slot 1) to test left-shift compaction:\n";
        manager.removeVehicle("XYZ-202");
        manager.displayParkingStatus();

        // 3. Test Priority Insertion (Right Shift)
        std::cout << "--> Inserting AMB-911 at Slot 0 to test right-shift insertion:\n";
        manager.insertPriorityVehicle("AMB-911", VehicleType::EMERGENCY, 0);
        manager.displayParkingStatus();

    } catch (const std::exception& e) {
        std::cerr << "Unhandled Exception: " << e.what() << "\n";
        return 1;
    }

    return 0;
}
