(function () {
  var MONTH_NAMES = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ];

  var WEEKDAY_NAMES = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

  function pad2(value) {
    return String(value).padStart(2, "0");
  }

  function dateKeyFromParts(year, monthIndex, day) {
    return year + "-" + pad2(monthIndex + 1) + "-" + pad2(day);
  }

  function formatDateLong(dateKey) {
    var parts = dateKey.split("-");
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    return d.toLocaleDateString("en-GB", {
      weekday: "long",
      day: "numeric",
      month: "long",
      year: "numeric"
    });
  }

  function groupedEvents(events) {
    var grouped = {};
    events.forEach(function (event) {
      if (!grouped[event.date]) {
        grouped[event.date] = [];
      }
      grouped[event.date].push(event);
    });
    return grouped;
  }

  function createDayButton(day, dateKey, eventsForDay, isCurrentMonth) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "calendar-day" + (isCurrentMonth ? "" : " is-outside");
    button.setAttribute("data-date", dateKey);

    var dayNumber = document.createElement("span");
    dayNumber.className = "calendar-day-number";
    dayNumber.textContent = String(day);
    button.appendChild(dayNumber);

    if (eventsForDay && eventsForDay.length > 0) {
      button.classList.add("has-event");

      var marker = document.createElement("span");
      marker.className = "calendar-day-marker";

      var types = [];
      eventsForDay.forEach(function (event) {
        if (types.indexOf(event.type) === -1) {
          types.push(event.type);
        }
      });

      types.forEach(function (type) {
        var logo = document.createElement("span");
        var normalizedType = type.toLowerCase();
        var isMarket = normalizedType === "market";
        var label = String(type || "Event");
        logo.className = "calendar-day-logo" + (isMarket ? " is-market" : "");
        logo.textContent = label;
        logo.setAttribute("aria-label", label);
        logo.setAttribute("title", label);
        marker.appendChild(logo);
      });

      button.appendChild(marker);
    }

    return button;
  }

  function renderEventDetails(events, selectedDate) {
    var title = document.getElementById("calendar-event-title");
    var list = document.getElementById("calendar-event-list");

    if (!title || !list) {
      return;
    }

    if (!events || events.length === 0) {
      title.textContent = formatDateLong(selectedDate);
      list.innerHTML = '<p class="calendar-empty">No events on this date.</p>';
      return;
    }

    title.textContent = formatDateLong(selectedDate);
    list.innerHTML = events
      .map(function (event) {
        var displayTitle = event.title || "";
        var registrationText = event.registrationUrl || "";
        var hasRegistrationLink = /^https?:\/\//i.test(String(registrationText));
        var registrationMarkup = hasRegistrationLink
          ? '<p class="calendar-event-cta"><a class="button small" href="' +
            registrationText +
            '" target="_blank" rel="noopener noreferrer">More Info</a></p>'
          : '<p class="calendar-registration-note">' +
            (registrationText || "No registration needed") +
            "</p>";

        if (event.type) {
          var typePattern = new RegExp("^" + String(event.type).replace(/[.*+?^${}()|[\\]\\]/g, "\\$&") + "\\s*[:\\-]\\s*", "i");
          displayTitle = displayTitle.replace(typePattern, "");
        }

        return (
          '<article class="calendar-event-card" data-event-id="' +
          event.id +
          '">' +
          '<header class="calendar-event-head">' +
          "<h4>" +
          displayTitle +
          "</h4>" +
          "</header>" +
          '<p class="calendar-event-meta">' +
          event.startTime +
          " - " +
          event.endTime +
          " | " +
          event.city +
          " | " +
          event.venue +
          "</p>" +
          '<p class="calendar-event-description">' +
          event.description +
          "</p>" +
          '<ul class="calendar-event-facts">' +
          "<li>Price: " +
          event.price +
          "</li>" +
          "<li>Capacity: " +
          event.capacity +
          "</li>" +
          "</ul>" +
          registrationMarkup +
          "</article>"
        );
      })
      .join("");
  }

  function renderCalendar(monthDate, eventsByDate) {
    var monthLabel = document.getElementById("calendar-month-label");
    var grid = document.getElementById("calendar-grid");

    if (!monthLabel || !grid) {
      return;
    }

    var year = monthDate.getFullYear();
    var month = monthDate.getMonth();

    monthLabel.textContent = MONTH_NAMES[month] + " " + year;

    var firstOfMonth = new Date(year, month, 1);
    var firstWeekdayMondayBased = (firstOfMonth.getDay() + 6) % 7;
    var daysInMonth = new Date(year, month + 1, 0).getDate();

    var prevMonthDays = new Date(year, month, 0).getDate();
    var dayCells = [];

    for (var i = firstWeekdayMondayBased - 1; i >= 0; i -= 1) {
      var prevDay = prevMonthDays - i;
      var prevDate = new Date(year, month - 1, prevDay);
      var prevKey = dateKeyFromParts(prevDate.getFullYear(), prevDate.getMonth(), prevDate.getDate());
      dayCells.push(createDayButton(prevDay, prevKey, eventsByDate[prevKey], false));
    }

    for (var day = 1; day <= daysInMonth; day += 1) {
      var currentKey = dateKeyFromParts(year, month, day);
      dayCells.push(createDayButton(day, currentKey, eventsByDate[currentKey], true));
    }

    while (dayCells.length % 7 !== 0) {
      var nextDayNumber = dayCells.length - (firstWeekdayMondayBased + daysInMonth) + 1;
      var nextDate = new Date(year, month + 1, nextDayNumber);
      var nextKey = dateKeyFromParts(nextDate.getFullYear(), nextDate.getMonth(), nextDate.getDate());
      dayCells.push(createDayButton(nextDayNumber, nextKey, eventsByDate[nextKey], false));
    }

    grid.innerHTML = "";

    WEEKDAY_NAMES.forEach(function (weekday) {
      var head = document.createElement("div");
      head.className = "calendar-weekday";
      head.textContent = weekday;
      grid.appendChild(head);
    });

    dayCells.forEach(function (cell) {
      grid.appendChild(cell);
    });
  }

  async function initCalendar() {
    var calendarRoot = document.getElementById("calendar-app");
    if (!calendarRoot) {
      return;
    }

    var events = [];

    try {
      var response = await fetch("assets/data/events.json", { cache: "no-store" });
      if (!response.ok) {
        throw new Error("Could not load events");
      }
      events = await response.json();
      if (!Array.isArray(events)) {
        throw new Error("Invalid events format");
      }
    } catch (error) {
      var errorBox = document.getElementById("calendar-load-error");
      if (errorBox) {
        errorBox.textContent = "Events could not be loaded. Please refresh the page.";
      }
      return;
    }

    var eventsByDate = groupedEvents(events);
    var currentMonth = new Date();
    currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), 1);

    var selectedDate = null;

    function refresh() {
      renderCalendar(currentMonth, eventsByDate);

      var firstDateWithEvent = Object.keys(eventsByDate)
        .filter(function (key) {
          var d = new Date(key);
          return d.getMonth() === currentMonth.getMonth() && d.getFullYear() === currentMonth.getFullYear();
        })
        .sort()[0];

      selectedDate = selectedDate || firstDateWithEvent || dateKeyFromParts(currentMonth.getFullYear(), currentMonth.getMonth(), 1);
      renderEventDetails(eventsByDate[selectedDate], selectedDate);

      document.querySelectorAll(".calendar-day").forEach(function (node) {
        node.classList.toggle("is-selected", node.getAttribute("data-date") === selectedDate);
      });
    }

    refresh();

    var grid = document.getElementById("calendar-grid");
    if (grid) {
      grid.addEventListener("click", function (event) {
        var dayButton = event.target.closest(".calendar-day");
        if (!dayButton) {
          return;
        }

        selectedDate = dayButton.getAttribute("data-date");

        var selectedDateObj = new Date(selectedDate);
        currentMonth = new Date(selectedDateObj.getFullYear(), selectedDateObj.getMonth(), 1);

        refresh();
      });
    }

    var prevBtn = document.getElementById("calendar-prev-month");
    var nextBtn = document.getElementById("calendar-next-month");

    if (prevBtn) {
      prevBtn.addEventListener("click", function () {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1);
        selectedDate = null;
        refresh();
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener("click", function () {
        currentMonth = new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1);
        selectedDate = null;
        refresh();
      });
    }
  }

  document.addEventListener("DOMContentLoaded", initCalendar);
})();
