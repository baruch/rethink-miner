$(document).ready(function() {
  var fields = $('#fields_select');
  fields.multiselect({
    numberDisplayed: 6,
    includeSelectAllOption: true,
    enableCaseInsensitiveFiltering: true,
  });
  // Select all fields by default
  $('option', fields).each(function (element) {
    fields.multiselect('select', $(this).val());
  });

  $('#order_select').multiselect({
    numberDisplayed: 6
  });

  $('.table-filter').each(function (element) {
    var field = $(this);
    function check_filter(eventObject) {
      var fparent = field.parent();
      var val = field.val().replace(/^\s+|\s+$/g, '');
      if (val == '') {
        fparent.removeClass('has-success');
        fparent.removeClass('has-error');
        return;
      }

      function has_success() {
        fparent.removeClass('has-error');
        fparent.addClass('has-success');
      }

      m = val.match(/^(>|>=|<=|<)\s*[0-9]+$/);
      if (m) {
        has_success();
        return;
      }

      m = val.match(/^(=|{|}|regex:)\s*\S.*$/)
      if (m) {
        has_success();
        return;
      }

      fparent.removeClass('has-success');
      fparent.addClass('has-error');
    }
    $(this).keyup(check_filter);
    check_filter(null);
  });
});
