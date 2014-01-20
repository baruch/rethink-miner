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
});
